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

# 导入自定义模块
from image_validator import ImageValidator
from embedding_service import embedding_service
from s3_uploader import S3Uploader

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__,
            static_folder='static',      # 静态文件文件夹             
            template_folder='templates')  # 模板文件夹CORS(app) CORS(app)

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

# 标签类型定义 - 修正为数据库中实际的标签类型名称
TAG_TYPES = {
    # 多级标签（4级树状结构）
    'multi_level': ['occasion', 'silhouette', 'product_type', 'style'],
    
    # 单级标签（扁平结构）- 修正标签类型名称
    'single_level': [
        'season', 'pose', 'model_race', 'composition_angle',
        'composition_shot', 'model_attribute', 'model_age', 
        'gender', 'fabric', 'color', 'composition_position',
        'model_size', 'composition_bodyratio', 'model_gender'
    ]
}

# 所有标签类型
ALL_TAG_TYPES = TAG_TYPES['multi_level'] + TAG_TYPES['single_level']

# 缓存装饰器
def cache_decorator(expiration=300):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            if not redis_client:
                return f(*args, **kwargs)
            
            cache_key = f"{f.__name__}:{str(args)}:{str(kwargs)}"
            cached = redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
            result = f(*args, **kwargs)
            redis_client.setex(cache_key, expiration, json.dumps(result, default=str))
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
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ==================== 标签相关API ====================

@app.route('/api/tags/all', methods=['GET'])
@cache_decorator(expiration=7200)  # 缓存2小时
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
        
        # 分别处理多级和单级标签
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

@app.route('/api/tags/<tag_type>', methods=['GET'])
@cache_decorator(expiration=7200)
def get_tags_by_type(tag_type):
    """获取特定类型的标签"""
    try:
        if tag_type not in ALL_TAG_TYPES:
            return jsonify({
                'success': False,
                'error': f'Invalid tag type. Valid types are: {", ".join(ALL_TAG_TYPES)}'
            }), 400
        
        query = """
            SELECT 
                id,
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
            WHERE tag_type = %s AND is_active = TRUE
            ORDER BY level, 
                     COALESCE(level1_code, '00'),
                     COALESCE(level2_code, '00'),
                     COALESCE(level3_code, '00'),
                     COALESCE(level4_code, '00000000')
        """
        
        tags = db.execute_query(query, (tag_type,))
        
        # 根据类型返回不同结构
        if tag_type in TAG_TYPES['multi_level']:
            result = build_tree_structure(tags)
        else:
            result = build_flat_structure(tags)
        
        return jsonify({
            'success': True,
            'data': result,
            'type': 'multi_level' if tag_type in TAG_TYPES['multi_level'] else 'single_level',
            'count': len(tags)
        })
    except Exception as e:
        logger.error(f"Error getting tags for type {tag_type}: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

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

# ==================== 参考图管理API ====================

@app.route('/api/reference-images', methods=['POST'])
def create_reference_image():
    """创建参考图标注"""
    try:
        data = request.json
        
        # 必填字段验证
        required_fields = ['reference_image_url', 'reference_type', 'style_tag_ids', 
                          'occasion_tag_ids', 'model_attribute_tag_ids', 'outfit_details']
        
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
        
        # 收集并验证标签
        all_tag_ids = collect_all_tag_ids(data)
        if all_tag_ids:
            invalid_tags = validate_tag_ids(all_tag_ids)
            if invalid_tags:
                return jsonify({
                    'success': False,
                    'error': f'Invalid tag IDs: {list(invalid_tags)}'
                }), 400
        
        # 添加父级标签
        enriched_tag_ids = enrich_with_parent_tags(all_tag_ids)
        
        # 构建插入查询
        insert_query = """
            INSERT INTO viba.reference_images (
                reference_image_url,
                reference_type,
                gen_pose_images, gen_pose_description,
                gen_outfit_images, gen_outfit_description,
                gen_scene_images, gen_scene_description,
                gen_composition_images, gen_composition_description,
                gen_style_images, gen_style_description,
                gen_content_prompt, gen_ml_model_source,
                product_item_ids, can_be_used_for_face_switching,
                pose_description, scene_description,
                pose_tag_ids, scene_tag_ids, outfit_type_tag_ids,
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
        
        # 准备参数 - 修正标签收集逻辑
        params = [
            data['reference_image_url'],
            data['reference_type'],
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
            data.get('gen_content_prompt'),
            data.get('gen_ml_model_source'),
            data.get('product_item_ids', []),
            data.get('can_be_used_for_face_switching'),
            data.get('pose_description'),
            data.get('scene_description'),
            enriched_tag_ids.get('pose', []),
            # scene_tag_ids 应该包含 occasion 标签
            enriched_tag_ids.get('occasion', []),
            enriched_tag_ids.get('outfit_type', []) + enriched_tag_ids.get('product_type', []),
            list(set(enriched_tag_ids.get('model_gender', []) + 
                     enriched_tag_ids.get('model_age', []) + 
                     enriched_tag_ids.get('model_race', []) + 
                     enriched_tag_ids.get('model_size', []) +
                     enriched_tag_ids.get('model_attribute', []))),
            enriched_tag_ids.get('fabric', []),
            enriched_tag_ids.get('fit', []) + enriched_tag_ids.get('silhouette', []),
            Json(data.get('outfit_details', [])),
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
            redis_client.delete('get_themes:*')
        
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