# app.py - 修复标签类型名称的Flask应用
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import os
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
import psycopg2
from psycopg2.extras import RealDictCursor, Json
import redis
import json
import hashlib
from functools import wraps
import uuid

# 导入自定义模块
from image_validator import ImageValidator
from embedding_service import embedding_service
from s3_uploader import S3Uploader

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__,
            static_folder='static',      # 静态文件文件夹             
            template_folder='templates')  # 模板文件夹CORS(app) 
CORS(app)

# 配置类
class Config:
    # 数据库配置
    POSTGRES_HOST = os.environ.get('POSTGRES_HOST')
    POSTGRES_PORT = os.environ.get('POSTGRES_PORT')
    POSTGRES_DB = os.environ.get('POSTGRES_DB')
    POSTGRES_USER = os.environ.get('POSTGRES_USER')
    POSTGRES_PASSWORD = os.environ.get('POSTGRES_PASSWORD')
    
    # S3配置
    AWS_ACCESS_KEY_ID = os.environ.get('AWS_ACCESS_KEY_ID')
    AWS_SECRET_ACCESS_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY')
    S3_BUCKET = os.environ.get('S3_BUCKET')
    S3_REGION = os.environ.get('S3_REGION')
    CLOUDFRONT_DOMAIN = os.environ.get('CLOUDFRONT_DOMAIN')  # 可选CDN域名
    
    # Redis配置
    REDIS_HOST = os.environ.get('REDIS_HOST', 'localhost')
    REDIS_PORT = int(os.environ.get('REDIS_PORT', 6379))
    REDIS_DB = int(os.environ.get('REDIS_DB', 0))

app.config.from_object(Config)

# 初始化S3上传器
s3_uploader = S3Uploader(
    bucket_name=app.config['S3_BUCKET'],
    region=app.config['S3_REGION'],
    access_key_id=app.config['AWS_ACCESS_KEY_ID'],
    secret_access_key=app.config['AWS_SECRET_ACCESS_KEY'],
    cloudfront_domain=app.config['CLOUDFRONT_DOMAIN']
)

# 初始化Redis
try:
    redis_client = redis.Redis(
        host=app.config['REDIS_HOST'],
        port=app.config['REDIS_PORT'],
        db=app.config['REDIS_DB'],
        decode_responses=True
    )
    redis_client.ping()
    logger.info("Redis connected successfully")
except Exception as e:
    logger.warning(f"Redis connection failed: {str(e)}")
    redis_client = None

# 数据库连接类
class Database:
    def __init__(self):
        self.connection_config = {
            'host': app.config['POSTGRES_HOST'],
            'port': app.config['POSTGRES_PORT'],
            'database': app.config['POSTGRES_DB'],
            'user': app.config['POSTGRES_USER'],
            'password': app.config['POSTGRES_PASSWORD']
        }
    
    def get_connection(self):
        return psycopg2.connect(**self.connection_config)
    
    def execute_query(self, query, params=None, fetch=True):
        conn = None
        try:
            conn = self.get_connection()
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(query, params)
                if fetch:
                    return cursor.fetchall()
                conn.commit()
                return cursor.rowcount
        except Exception as e:
            if conn:
                conn.rollback()
            logger.error(f"Database error: {str(e)}")
            raise
        finally:
            if conn:
                conn.close()
    
    def execute_insert(self, query, params=None):
        conn = None
        try:
            conn = self.get_connection()
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(query, params)
                result = cursor.fetchone()
                conn.commit()
                return result
        except Exception as e:
            if conn:
                conn.rollback()
            logger.error(f"Database error: {str(e)}")
            raise
        finally:
            if conn:
                conn.close()

db = Database()

# 导入配置模块
from tag_config import (
    TAG_TYPES,
    FIELD_MAPPING,
    MODEL_ATTRIBUTE_FIELDS,
    COMPOSITION_FIELDS,
    SPECIAL_TAG_TYPES,
    get_all_tag_types,
    is_multi_level,
    is_single_level,
    get_db_field_name,
    validate_config,
    export_config_for_frontend
)

# 在应用启动时验证配置
def validate_tag_config():
    """验证标签配置"""
    is_valid, errors = validate_config()
    if not is_valid:
        logger.error(f"标签配置验证失败: {', '.join(errors)}")
        raise ValueError("标签配置无效")
    logger.info("标签配置验证通过")

# 获取所有标签类型（使用配置）
ALL_TAG_TYPES = get_all_tag_types()

# 缓存装饰器
# 修复缓存装饰器
def cache_decorator(expiration=300):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            if not redis_client:
                return f(*args, **kwargs)
            
            # 生成缓存键
            import hashlib
            key_data = f"{f.__module__}.{f.__name__}:{str(args)}:{str(sorted(kwargs.items()))}"
            cache_key = f"cache:{hashlib.md5(key_data.encode()).hexdigest()}"
            
            try:
                cached = redis_client.get(cache_key)
                if cached:
                    # 确保返回的是字典，不是Response对象
                    cached_data = json.loads(cached)
                    if isinstance(cached_data, dict):
                        return cached_data
                    else:
                        # 如果缓存的数据格式不对，删除缓存
                        redis_client.delete(cache_key)
            except Exception as e:
                logger.warning(f"Cache get error: {e}")
                # 删除有问题的缓存
                try:
                    redis_client.delete(cache_key)
                except:
                    pass
            
            # 执行原函数
            result = f(*args, **kwargs)
            
            # 只缓存成功的字典结果
            if isinstance(result, tuple) and len(result) == 2:
                response_data, status_code = result
                if status_code == 200 and isinstance(response_data.get_json(), dict):
                    try:
                        redis_client.setex(cache_key, expiration, json.dumps(response_data.get_json()))
                    except Exception as e:
                        logger.warning(f"Cache set error: {e}")
            
            return result
        return wrapper
    return decorator

# ==================== API路由 ====================

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/status')
def api_status():
    """API服务状态"""
    return jsonify({
        'service': 'VIBA Reference Image Annotation API',
        'version': '1.0.0',
        'status': 'running',
        'health_check': '/api/health',
        'timestamp': datetime.now().isoformat()
    })

# ==================== 主题相关API ====================

@app.route('/api/themes', methods=['GET'])
@cache_decorator(expiration=600)
def get_themes():
    """获取所有主题"""
    try:
        query = """
            SELECT unique_id, title, description, cultural_insights
            FROM viba.themes
            ORDER BY created_at DESC
        """
        themes = db.execute_query(query)
        return jsonify({
            'success': True,
            'data': themes
        }), 200 
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ==================== 标签相关API ====================
@app.route('/api/config/tags', methods=['GET'])
def get_tag_config():
    """获取标签配置信息（供前端使用）"""
    try:
        config = export_config_for_frontend()
        return jsonify({
            'success': True,
            'data': config
        }), 200
    except Exception as e:
        logger.error(f"Error getting tag config: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/tags/all', methods=['GET'])
@cache_decorator(expiration=600)  # 缓存2小时
def get_all_tags():
    """一次性获取所有标签，区分多级和单级"""
    try:
        query = """
            SELECT 
                id,
                tag_type,
                tag_name,
                tag_name_cn,
                parent_tag_id,
                level,
                level1_code,
                level2_code,
                level3_code,
                level4_code,
                full_code,
                is_leaf,
                attributes
            FROM viba.tag_definitions
            WHERE is_active = TRUE
            ORDER BY tag_type, level, 
                     COALESCE(level1_code, '00'),
                     COALESCE(level2_code, '00'),
                     COALESCE(level3_code, '00'),
                     COALESCE(level4_code, '00000000')
        """
        
        all_tags = db.execute_query(query)
        
        # 按类型分组
        tags_by_type = {}
        for tag in all_tags:
            tag_type = tag['tag_type']
            if tag_type not in tags_by_type:
                tags_by_type[tag_type] = []
            tags_by_type[tag_type].append(tag)
        
        # 分别处理多级和单级标签（使用配置）
        result = {
            'multi_level': {},
            'single_level': {},
            'tag_types': {
                'multi_level': TAG_TYPES['multi_level'],
                'single_level': TAG_TYPES['single_level']
            }
        }
        
        # 处理多级标签
        for tag_type in TAG_TYPES['multi_level']:
            if tag_type in tags_by_type:
                result['multi_level'][tag_type] = build_tree_structure(tags_by_type[tag_type])
        
        # 处理单级标签
        for tag_type in TAG_TYPES['single_level']:
            if tag_type in tags_by_type:
                result['single_level'][tag_type] = build_flat_structure(tags_by_type[tag_type])
        
        # 添加特殊标签类型信息
        result['special_types'] = SPECIAL_TAG_TYPES
        
        # 统计信息
        stats = {
            'total_count': len(all_tags),
            'by_type': {tag_type: len(tags) for tag_type, tags in tags_by_type.items()}
        }
        
        return jsonify({
            'success': True,
            'data': result,
            'stats': stats
        })
    except Exception as e:
        logger.error(f"Error getting all tags: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# @app.route('/api/tags/<tag_type>', methods=['GET'])
# @cache_decorator(expiration=7200)
# def get_tags_by_type(tag_type):
#     """获取特定类型的标签"""
#     try:
#         if tag_type not in ALL_TAG_TYPES:
#             return jsonify({
#                 'success': False,
#                 'error': f'Invalid tag type. Valid types are: {", ".join(ALL_TAG_TYPES)}'
#             }), 400
        
#         query = """
#             SELECT 
#                 id,
#                 tag_name,
#                 tag_name_cn,
#                 parent_tag_id,
#                 level,
#                 level1_code,
#                 level2_code,
#                 level3_code,
#                 level4_code,
#                 full_code,
#                 is_leaf,
#                 attributes
#             FROM viba.tag_definitions
#             WHERE tag_type = %s AND is_active = TRUE
#             ORDER BY level, 
#                      COALESCE(level1_code, '00'),
#                      COALESCE(level2_code, '00'),
#                      COALESCE(level3_code, '00'),
#                      COALESCE(level4_code, '00000000')
#         """
        
#         tags = db.execute_query(query, (tag_type,))
        
#         # 根据配置确定类型并返回不同结构
#         if is_multi_level(tag_type):
#             result = build_tree_structure(tags)
#         else:
#             result = build_flat_structure(tags)
        
#         return jsonify({
#             'success': True,
#             'data': result,
#             'type': 'multi_level' if is_multi_level(tag_type) else 'single_level',
#             'count': len(tags)
#         })
#     except Exception as e:
#         logger.error(f"Error getting tags for type {tag_type}: {str(e)}")
#         return jsonify({
#             'success': False,
#             'error': str(e)
#         }), 500

# ==================== 图片上传API ====================

@app.route('/api/upload-image', methods=['POST'])
def upload_image():
    """上传单张图片到S3"""
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file provided'}), 400
        
        file = request.files['file']
        image_type = request.form.get('image_type', 'reference_image')
        
        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400
        
        # 读取文件数据
        file_data = file.read()
        
        # 验证图片（竖屏要求）
        validation_result = ImageValidator.validate_image(file_data)
        if not validation_result['valid']:
            return jsonify({'success': False, 'error': validation_result['error']}), 400
        
        # 压缩大图片
        if validation_result['file_size_mb'] > 10:
            file_data = ImageValidator.compress_image(file_data, quality=85)
        
        # 计算文件哈希（用于去重）
        file_hash = hashlib.md5(file_data).hexdigest()
        
        # 检查缓存
        if redis_client:
            cached_url = redis_client.get(f"file_hash:{file_hash}:{image_type}")
            if cached_url:
                return jsonify({
                    'success': True,
                    'data': {
                        'url': cached_url,
                        'cached': True,
                        'image_info': {
                            'width': validation_result['width'],
                            'height': validation_result['height']
                        }
                    }
                })
        
        # 上传到S3
        url = s3_uploader.upload_file(
            file_data=file_data,
            file_type=image_type,
            content_type=file.content_type or 'image/jpeg'
        )
        
        # 缓存URL（24小时）
        if redis_client:
            redis_client.setex(f"file_hash:{file_hash}:{image_type}", 86400, url)
        
        return jsonify({
            'success': True,
            'data': {
                'url': url,
                'cached': False,
                'image_info': {
                    'width': validation_result['width'],
                    'height': validation_result['height']
                }
            }
        })
    except Exception as e:
        logger.error(f"Upload error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500



@app.route('/api/upload-batch', methods=['POST'])
def upload_batch_images():
    """批量上传图片"""
    try:
        files = request.files.getlist('files')
        image_types = request.form.getlist('image_types')
        
        if not files:
            return jsonify({'success': False, 'error': 'No files provided'}), 400
        
        if len(files) != len(image_types):
            return jsonify({'success': False, 'error': 'Files and types count mismatch'}), 400
        
        results = []
        for file, image_type in zip(files, image_types):
            try:
                file_data = file.read()
                
                # 验证图片
                validation_result = ImageValidator.validate_image(file_data)
                if not validation_result['valid']:
                    results.append({
                        'filename': file.filename,
                        'success': False,
                        'error': validation_result['error']
                    })
                    continue
                
                # 压缩大图片
                if validation_result['file_size_mb'] > 10:
                    file_data = ImageValidator.compress_image(file_data, quality=85)
                
                # 上传到S3
                url = s3_uploader.upload_file(
                    file_data=file_data,
                    file_type=image_type
                )
                
                results.append({
                    'filename': file.filename,
                    'success': True,
                    'url': url,
                    'type': image_type
                })
            except Exception as e:
                results.append({
                    'filename': file.filename,
                    'success': False,
                    'error': str(e)
                })
        
        return jsonify({
            'success': True,
            'data': results
        })
    except Exception as e:
        logger.error(f"Batch upload error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

# ==================== 辅助函数 ====================

def collect_all_tag_ids(data):
    """
    从请求数据中收集所有标签ID
    保持原始分组，用于后续的父级补充
    
    Args:
        data: 请求数据字典
    
    Returns:
        所有标签ID的集合（用于验证）
    """
    all_tag_ids = set()
    
    # 收集各种标签ID
    tag_fields = [
        'style_tag_ids',
        'occasion_tag_ids', 
        'pose_tag_ids',
        'model_attribute_tag_ids',
        'composition_tag_ids'
    ]
    
    for field in tag_fields:
        if field in data and data[field]:
            if isinstance(data[field], list):
                all_tag_ids.update(data[field])
            else:
                all_tag_ids.add(data[field])
    
    # 收集服装详情中的标签
    if 'outfit_details' in data and data['outfit_details']:
        for outfit in data['outfit_details']:
            if isinstance(outfit, dict):
                # 产品类型标签
                if 'product_type_tag_ids' in outfit and outfit['product_type_tag_ids']:
                    all_tag_ids.update(outfit['product_type_tag_ids'])
                
                # 材质标签
                if 'fabric_tag_id' in outfit and outfit['fabric_tag_id']:
                    all_tag_ids.add(outfit['fabric_tag_id'])
                
                # 版型标签
                if 'silhouette_tag_id' in outfit and outfit['silhouette_tag_id']:
                    val = outfit['silhouette_tag_id']
                    if isinstance(val, list):
                        all_tag_ids.update(val)
                    else:
                        all_tag_ids.add(val)
                    
                # 颜色标签
                if 'color_tag_id' in outfit and outfit['color_tag_id']:
                    all_tag_ids.add(outfit['color_tag_id'])
    
    # 过滤掉None和无效值
    return {tag_id for tag_id in all_tag_ids if tag_id is not None}


def enrich_with_parent_tags(tag_ids_by_field):
    """
    为每组标签ID添加所有父级标签ID
    确保存储的是完整的标签层级链
    
    Args:
        tag_ids_by_field: 按字段分组的标签ID字典
                         如: {'style_tag_ids': [3, 4], 'occasion_tag_ids': [10, 11]}
    
    Returns:
        enriched_dict: 包含所有父级的标签ID字典
                      如: {'style_tag_ids': [1, 2, 3, 4], 'occasion_tag_ids': [8, 9, 10, 11]}
    """
    if not tag_ids_by_field:
        return {}
    
    enriched = {}
    
    for field_name, tag_ids in tag_ids_by_field.items():
        if not tag_ids:
            enriched[field_name] = []
            continue
        
        # 对于每个标签ID，获取其完整的父级链
        all_ids_with_parents = set()
        
        for tag_id in tag_ids:
            try:
                # 查询该标签及其所有父级
                query = """
                    WITH RECURSIVE tag_path AS (
                        -- 起始：选择当前标签
                        SELECT id, parent_tag_id, tag_type, level
                        FROM viba.tag_definitions
                        WHERE id = %s AND is_active = TRUE
                        
                        UNION
                        
                        -- 递归：选择所有父级
                        SELECT t.id, t.parent_tag_id, t.tag_type, t.level
                        FROM viba.tag_definitions t
                        INNER JOIN tag_path tp ON t.id = tp.parent_tag_id
                        WHERE t.is_active = TRUE
                    )
                    SELECT DISTINCT id FROM tag_path
                """
                
                results = db.execute_query(query, (tag_id,))
                all_ids_with_parents.update([r['id'] for r in results])
                
            except Exception as e:
                logger.warning(f"Failed to get parent tags for {tag_id}: {str(e)}")
                # 至少添加原始标签
                all_ids_with_parents.add(tag_id)
        
        enriched[field_name] = list(all_ids_with_parents)
    
    return enriched


def prepare_tag_data_for_storage(data):
    """
    准备标签数据用于存储
    处理字段映射和标签分组
    
    重要映射：
    - occasion_tag_ids (前端) -> scene_tag_ids (数据库)
    - product_type_tag_ids (前端) -> outfit_type_tag_ids (数据库)  
    - silhouette_tag_ids (前端) -> fit_tag_ids (数据库)
    - model_race/age/size/gender (前端) -> model_attribute_tag_ids (数据库)
    
    Args:
        data: 请求数据
    
    Returns:
        标准化的标签数据字典
    """
    tag_data = {}
    
     # 处理风格标签
    if 'style_tag_ids' in data and data['style_tag_ids']:
        db_field = get_db_field_name('style_tag_ids')
        tag_data[db_field] = data['style_tag_ids'] if isinstance(data['style_tag_ids'], list) else [data['style_tag_ids']]
    
    # 处理场合标签
    if 'occasion_tag_ids' in data and data['occasion_tag_ids']:
        db_field = get_db_field_name('occasion_tag_ids')  # 将返回 'scene_tag_ids'
        tag_data[db_field] = data['occasion_tag_ids'] if isinstance(data['occasion_tag_ids'], list) else [data['occasion_tag_ids']]
    
    # 处理姿势标签
    if 'pose_tag_ids' in data and data['pose_tag_ids']:
        db_field = get_db_field_name('pose_tag_ids')
        tag_data[db_field] = data['pose_tag_ids'] if isinstance(data['pose_tag_ids'], list) else [data['pose_tag_ids']]

    # 处理构图标签
    if 'composition_tag_ids' in data and data['composition_tag_ids']:
        db_field = get_db_field_name('composition_tag_ids')
        tag_data[db_field] = data['composition_tag_ids'] if isinstance(data['composition_tag_ids'], list) else [data['composition_tag_ids']]

    # 处理模特属性标签
    if 'model_attribute_tag_ids' in data and data['model_attribute_tag_ids']:
        tag_data['model_attribute_tag_ids'] = data['model_attribute_tag_ids'] if isinstance(data['model_attribute_tag_ids'], list) else [data['model_attribute_tag_ids']]
    
    # 处理服装详情中的标签
    if 'outfit_details' in data and data['outfit_details']:
        outfit_type_ids = []
        fabric_ids = []
        silhouette_ids = []
        
        for outfit in data['outfit_details']:
            if isinstance(outfit, dict):
                # 产品类型标签
                if 'product_type_tag_ids' in outfit and outfit['product_type_tag_ids']:
                    outfit_type_ids.extend(outfit['product_type_tag_ids'])
                
                # 材质标签
                if 'fabric_tag_id' in outfit and outfit['fabric_tag_id']:
                    fabric_ids.append(outfit['fabric_tag_id'])
                
                # 版型/廓形标签（现在是数组）
                if 'silhouette_tag_id' in outfit and outfit['silhouette_tag_id']:
                    if isinstance(outfit['silhouette_tag_id'], list):
                        silhouette_ids.extend(outfit['silhouette_tag_id'])
                    else:
                        silhouette_ids.append(outfit['silhouette_tag_id'])
        
        # 使用配置中的映射
        if outfit_type_ids:
            db_field = get_db_field_name('product_type_tag_ids')  # 返回 'outfit_type_tag_ids'
            tag_data[db_field] = list(set(outfit_type_ids))
        if fabric_ids:
            db_field = get_db_field_name('fabric_tag_ids')
            tag_data[db_field] = list(set(fabric_ids))
        if silhouette_ids:
            db_field = get_db_field_name('silhouette_tag_ids')  # 返回 'fit_tag_ids'
            tag_data[db_field] = list(set(silhouette_ids))
    
    return tag_data



# ==================== 参考图管理API ====================
# ==================== 修改后的 create_reference_image 函数 ====================

@app.route('/api/reference-images', methods=['POST'])
def create_reference_image():
    """创建参考图标注"""
    try:
        data = request.json
        logger.info(f"Received data keys: {list(data.keys())}")
        
        # 必填字段验证
        required_fields = ['reference_image_url', 'reference_type']
        
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        # 根据类型验证特定字段
        if data['reference_type'] == 1:  # 生成图
            if not data.get('gen_content_prompt') or not data.get('gen_ml_model_source'):
                return jsonify({
                    'success': False,
                    'error': 'Generated images require gen_content_prompt and gen_ml_model_source'
                }), 400
        elif data['reference_type'] == 2:  # 匹配图
            if 'can_be_used_for_face_switching' not in data:
                return jsonify({
                    'success': False,
                    'error': 'Matching images require can_be_used_for_face_switching field'
                }), 400
        
        # 生成向量嵌入
        embeddings = generate_embeddings_for_reference(data)

        logger.info(data)
        
        # 收集并验证标签
        all_tag_ids = collect_all_tag_ids(data)

        if all_tag_ids:
            invalid_tags = validate_tag_ids(all_tag_ids)
            if invalid_tags:
                return jsonify({
                    'success': False,
                    'error': f'Invalid tag IDs: {list(invalid_tags)}'
                }), 400
        
        # 准备标签数据（处理字段映射）
        tag_data = prepare_tag_data_for_storage(data)
        
        # 添加父级标签
        enriched_tags = enrich_with_parent_tags(tag_data)
        
        logger.info(f"Enriched tags: {list(enriched_tags.keys())}")
        
        # 构建插入查询
        insert_query = """
            INSERT INTO viba.reference_images (
                reference_image_url,
                reference_type,
                theme_ids,
                gen_pose_images, gen_pose_description,
                gen_outfit_images, gen_outfit_description,
                gen_scene_images, gen_scene_description,
                gen_composition_images, gen_composition_description,
                gen_style_images, gen_style_description,
                gen_content_prompt, gen_ml_model_source,
                product_item_ids, can_be_used_for_face_switching,
                pose_description, scene_description,
                style_tag_ids, pose_tag_ids, scene_tag_ids, composition_tag_ids, outfit_type_tag_ids,
                model_attribute_tag_ids, fabric_tag_ids, fit_tag_ids,
                outfit_details,
                gen_content_embedding, gen_pose_embedding,
                gen_outfit_embedding, gen_scene_embedding,
                gen_composition_embedding, pose_embedding, scene_embedding
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s
            ) RETURNING id, unique_id
        """
        
        # 准备参数 - 使用正确的映射
        ## 将product_item_id由text转为uuid
        product_item_ids = []
        if data.get('product_item_ids'):
            for i, uid in enumerate(data.get('product_item_ids', [])):
                try:
                    if uid.strip():  # Skip empty strings
                        validated_uuid = str(uuid.UUID(uid.strip()))
                        product_item_ids.append(validated_uuid)
                except ValueError:
                    return jsonify({
                        'success': False,
                        'error': f'Invalid UUID format at position {i+1}: "{uid}"'
                    }), 400
                
                
        params = [
            # 基础字段
            data['reference_image_url'],
            data['reference_type'],
            
            # 生成图相关字段
            data.get('gen_pose_images', []),
            data.get('gen_pose_description'),
            data.get('gen_outfit_images', []),
            data.get('gen_outfit_description'),
            data.get('gen_scene_images', []),
            data.get('gen_scene_description'),
            data.get('gen_composition_images', []),
            data.get('gen_composition_description'),
            data.get('gen_style_images', []),
            data.get('gen_style_description'),
            data.get('gen_content_prompt',[]),
            data.get('gen_ml_model_source'),
            
            # 匹配图相关字段
            product_item_ids,
            data.get('can_be_used_for_face_switching'),
            data.get('pose_description'),
            data.get('scene_description'),
            
            # 标签数组字段 - 使用enriched_tags中的映射后数据
            enriched_tags.get('style_tag_ids',[]),
            enriched_tags.get('pose_tag_ids', []),
            enriched_tags.get('scene_tag_ids', []),  # occasion_tag_ids 映射到这里
            enriched_tags.get('composition_tag_ids',[]),
            enriched_tags.get('outfit_type_tag_ids', []),  # product_type_tag_ids 映射到这里
            enriched_tags.get('model_attribute_tag_ids', []),  # 四个模特属性合并
            enriched_tags.get('fabric_tag_ids', []),
            enriched_tags.get('fit_tag_ids', []),  # silhouette_tag_ids 映射到这里
            
            # 服装详情JSON
            Json(data.get('outfit_details', [])),
            
            # 向量嵌入字段
            embeddings.get('gen_content_embedding'),
            embeddings.get('gen_pose_embedding'),
            embeddings.get('gen_outfit_embedding'),
            embeddings.get('gen_scene_embedding'),
            embeddings.get('gen_composition_embedding'),
            embeddings.get('pose_embedding'),
            embeddings.get('scene_embedding')
        ]
        
        # 插入数据
        result = db.execute_insert(insert_query, params)
        
        # 关联主题
        if 'theme_ids' in data and data['theme_ids']:
            for theme_id in data['theme_ids']:
                theme_query = """
                    INSERT INTO viba.ref_images_to_themes (ref_image_id, theme_id)
                    VALUES (%s, %s)
                    ON CONFLICT DO NOTHING
                """
                db.execute_query(theme_query, (result['unique_id'], theme_id), fetch=False)
        
        # 清除缓存
        if redis_client:
            redis_client.delete('get_reference_images:*')
        
        return jsonify({
            'success': True,
            'data': {
                'id': result['id'],
                'unique_id': str(result['unique_id'])
            }
        })
    except Exception as e:
        logger.error(f"Error creating reference image: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


        
@app.route('/api/reference-images/<unique_id>', methods=['GET'])
def get_reference_image(unique_id):
    """获取单个参考图详情"""
    try:
        query = """
            SELECT 
                ri.*,
                array_agg(DISTINCT t.title) FILTER (WHERE t.title IS NOT NULL) as theme_titles,
                array_agg(DISTINCT t.unique_id) FILTER (WHERE t.unique_id IS NOT NULL) as theme_ids
            FROM viba.reference_images ri
            LEFT JOIN viba.ref_images_to_themes rit ON ri.unique_id = rit.ref_image_id
            LEFT JOIN viba.themes t ON rit.theme_id = t.unique_id
            WHERE ri.unique_id = %s
            GROUP BY ri.id, ri.unique_id
        """
        
        results = db.execute_query(query, (unique_id,))
        
        if not results:
            return jsonify({
                'success': False,
                'error': 'Reference image not found'
            }), 404
        
        return jsonify({
            'success': True,
            'data': results[0]
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/reference-images/search', methods=['POST'])
def search_reference_images():
    """搜索参考图"""
    try:
        data = request.json
        conditions = []
        params = []
        
        # 构建搜索条件
        if 'reference_type' in data:
            conditions.append("reference_type = %s")
            params.append(data['reference_type'])
        
        if 'theme_ids' in data and data['theme_ids']:
            conditions.append("""
                EXISTS (
                    SELECT 1 FROM viba.ref_images_to_themes 
                    WHERE ref_image_id = ri.unique_id 
                    AND theme_id = ANY(%s)
                )
            """)
            params.append(data['theme_ids'])
        
        if 'search_text' in data and data['search_text']:
            conditions.append("search_text ILIKE %s")
            params.append(f"%{data['search_text']}%")
        
        where_clause = " AND ".join(conditions) if conditions else "1=1"
        
        query = f"""
            SELECT 
                ri.unique_id,
                ri.reference_image_url,
                ri.reference_type,
                ri.gen_content_prompt,
                ri.created_at,
                array_agg(DISTINCT t.title) FILTER (WHERE t.title IS NOT NULL) as theme_titles
            FROM viba.reference_images ri
            LEFT JOIN viba.ref_images_to_themes rit ON ri.unique_id = rit.ref_image_id
            LEFT JOIN viba.themes t ON rit.theme_id = t.unique_id
            WHERE {where_clause}
            GROUP BY ri.unique_id, ri.reference_image_url, ri.reference_type, 
                     ri.gen_content_prompt, ri.created_at
            ORDER BY ri.created_at DESC
            LIMIT %s OFFSET %s
        """
        
        limit = data.get('limit', 20)
        offset = data.get('offset', 0)
        params.extend([limit, offset])
        
        results = db.execute_query(query, params)
        
        return jsonify({
            'success': True,
            'data': {
                'items': results,
                'limit': limit,
                'offset': offset
            }
        })
    except Exception as e:
        logger.error(f"Search error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

# ==================== 健康检查 ====================

@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查"""
    try:
        db.execute_query("SELECT 1", fetch=True)
        db_status = 'healthy'
    except:
        db_status = 'unhealthy'
    
    redis_status = 'healthy' if redis_client and redis_client.ping() else 'unhealthy'
    
    return jsonify({
        'success': True,
        'status': 'healthy' if db_status == 'healthy' else 'degraded',
        'services': {
            'database': db_status,
            'redis': redis_status,
            's3': 'configured' if app.config['AWS_ACCESS_KEY_ID'] else 'not configured'
        },
        'timestamp': datetime.now().isoformat()
    })

# ==================== 辅助函数 ====================

def build_tree_structure(tags):
    """构建多级标签的树状结构"""
    tag_by_id = {}
    tags_by_level = {1: [], 2: [], 3: [], 4: []}
    parent_to_children = {}
    
    # 第一遍：建立索引
    for tag in tags:
        tag_dict = {
            'id': tag['id'],
            'name': tag['tag_name'],
            'name_cn': tag['tag_name_cn'],
            'parent_id': tag['parent_tag_id'],
            'level': tag['level'],
            'full_code': tag['full_code'],
            'is_leaf': tag['is_leaf'],
            'children': []
        }
        
        tag_by_id[tag['id']] = tag_dict
        
        level = tag['level']
        if level and level in tags_by_level:
            tags_by_level[level].append(tag_dict)
        
        parent_id = tag['parent_tag_id']
        if parent_id:
            if parent_id not in parent_to_children:
                parent_to_children[parent_id] = []
            parent_to_children[parent_id].append(tag['id'])
    
    # 第二遍：构建树
    root_tags = []
    for tag_id, tag in tag_by_id.items():
        if tag['parent_id'] is None:
            root_tags.append(tag)
        elif tag['parent_id'] in tag_by_id:
            tag_by_id[tag['parent_id']]['children'].append(tag)
    
    # 构建级联数据
    cascade_data = {
        'level1': [],
        'level2_by_parent': {},
        'level3_by_parent': {},
        'level4_by_parent': {}
    }
    
    for tag in tags_by_level.get(1, []):
        cascade_data['level1'].append({
            'value': tag['id'],
            'label': tag['name_cn'],
            'name': tag['name']
        })
    
    for parent_id, child_ids in parent_to_children.items():
        parent_tag = tag_by_id.get(parent_id)
        if parent_tag:
            parent_level = parent_tag['level']
            children_data = []
            for child_id in child_ids:
                child_tag = tag_by_id.get(child_id)
                if child_tag:
                    children_data.append({
                        'value': child_tag['id'],
                        'label': child_tag['name_cn'],
                        'name': child_tag['name']
                    })
            
            if parent_level == 1:
                cascade_data['level2_by_parent'][parent_id] = children_data
            elif parent_level == 2:
                cascade_data['level3_by_parent'][parent_id] = children_data
            elif parent_level == 3:
                cascade_data['level4_by_parent'][parent_id] = children_data
    
    return {
        'tree': root_tags,
        'flat': tag_by_id,
        'levels': tags_by_level,
        'cascade': cascade_data,
        'parent_map': parent_to_children
    }

def build_flat_structure(tags):
    """构建单级标签的扁平结构"""
    tag_list = []
    tag_by_id = {}
    
    for tag in tags:
        tag_dict = {
            'id': tag['id'],
            'name': tag['tag_name'],
            'name_cn': tag['tag_name_cn'],
            'full_code': tag['full_code'],
            'attributes': tag.get('attributes', {})
        }
        
        tag_list.append(tag_dict)
        tag_by_id[tag['id']] = tag_dict
    
    return {
        'list': tag_list,
        'flat': tag_by_id
    }

def generate_embeddings_for_reference(data):
    """生成参考图的向量嵌入"""
    embeddings = {}
    
    if data['reference_type'] == 1:  # 生成图
        if data.get('gen_content_prompt'):
            embeddings['gen_content_embedding'] = embedding_service.generate_embedding(
                data['gen_content_prompt'], 768
            )
        
        fields_384 = [
            ('gen_pose_description', 'gen_pose_embedding'),
            ('gen_outfit_description', 'gen_outfit_embedding'),
            ('gen_scene_description', 'gen_scene_embedding'),
            ('gen_composition_description', 'gen_composition_embedding')
        ]
        
        for field_name, embedding_name in fields_384:
            if data.get(field_name):
                embeddings[embedding_name] = embedding_service.generate_embedding(
                    data[field_name], 384
                )
    
    elif data['reference_type'] == 2:  # 匹配图
        if data.get('pose_description'):
            embeddings['pose_embedding'] = embedding_service.generate_embedding(
                data['pose_description'], 384
            )
        
        if data.get('scene_description'):
            embeddings['scene_embedding'] = embedding_service.generate_embedding(
                data['scene_description'], 384
            )
    
    return embeddings

def validate_tag_ids(tag_ids):
    """验证标签ID是否存在"""
    if not tag_ids:
        return set()
    
    query = """
        SELECT id FROM viba.tag_definitions 
        WHERE id = ANY(%s) AND is_active = TRUE
    """
    valid_tags = db.execute_query(query, (list(tag_ids),))
    valid_tag_ids = {tag['id'] for tag in valid_tags}
    
    return tag_ids - valid_tag_ids

# ==================== 错误处理 ====================

@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'success': False,
        'error': 'Endpoint not found'
    }), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({
        'success': False,
        'error': 'Internal server error'
    }), 500

# ==================== 主程序入口 ====================

if __name__ == '__main__':
    # 初始化S3文件夹结构（可选）
    try:
        s3_uploader.create_folder_structure()
        logger.info("S3 folder structure initialized")
    except Exception as e:
        logger.warning(f"Failed to initialize S3 folders: {str(e)}")
    
    app.run(debug=True, host='0.0.0.0', port=5001)