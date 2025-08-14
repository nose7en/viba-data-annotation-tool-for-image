# tag_config.py - 标签类型配置文件
"""
标签类型定义配置文件
管理所有标签类型的分类和映射关系
"""

# 标签类型定义
TAG_TYPES = {
    # 多级标签（树状结构，支持2-4级）
    'multi_level': [
        'occasion',      # 场合
        'style',         # 风格  
        'product_type',  # 产品类型
        'silhouette'     # 廓形/版型
    ],
    
    # 单级标签（扁平结构）
    'single_level': [
        'season',               # 季节
        'pose',                 # 姿势
        'model_race',           # 种族
        'model_age',            # 年龄
        'model_gender',         # 性别
        'model_fit',            # 体型（原 model_size）
        'model_attribute',      # 模特属性（综合）
        'gender',               # 性别（通用）
        'fabric',               # 材质
        'color',                # 颜色
        'composition_angle',    # 构图角度
        'composition_shot',     # 镜头类型
        'composition_position', # 人物位置
        'composition_bodyratio' # 人身比例
    ]
}

# 前端字段到数据库字段的映射
FIELD_MAPPING = {
    # 前端字段名 -> 数据库字段名（字段已统一，保持同名映射）
    'occasion_tag_ids': 'occasion_tag_ids',
    'product_type_tag_ids': 'product_type_tag_ids',
    'silhouette_tag_ids': 'silhouette_tag_ids',
    'style_tag_ids': 'style_tag_ids',
    'pose_tag_ids': 'pose_tag_ids',
    'fabric_tag_ids': 'fabric_tag_ids',
    'color_tag_ids': 'color_tag_ids',
}

# 模特属性相关字段
MODEL_ATTRIBUTE_FIELDS = [
    'model_age',
    'model_gender', 
    'model_race',
    'model_fit'
]

# 构图相关字段
COMPOSITION_FIELDS = [
    'composition_shot',
    'composition_angle',
    'composition_bodyratio',
    'composition_position'
]

# 特殊处理的标签类型
SPECIAL_TAG_TYPES = {
    'silhouette': {
        'expected_level1_count': 2,  # 期望的一级节点数量
        'auto_select': True,          # 是否自动选择不同的一级节点
        'description': '廓形/版型标签，包含服装结构和服装廓形两个一级分类'
    }
}

# 获取所有标签类型
def get_all_tag_types():
    """获取所有标签类型列表"""
    return TAG_TYPES['multi_level'] + TAG_TYPES['single_level']

# 检查标签类型
def is_multi_level(tag_type):
    """检查是否为多级标签"""
    return tag_type in TAG_TYPES['multi_level']

def is_single_level(tag_type):
    """检查是否为单级标签"""
    return tag_type in TAG_TYPES['single_level']

# 获取数据库字段名
def get_db_field_name(frontend_field):
    """
    根据前端字段名获取对应的数据库字段名
    
    Args:
        frontend_field: 前端使用的字段名
    
    Returns:
        对应的数据库字段名，如果没有映射则返回原字段名
    """
    return FIELD_MAPPING.get(frontend_field, frontend_field)

# 反向映射：数据库字段到前端字段
def get_frontend_field_name(db_field):
    """
    根据数据库字段名获取对应的前端字段名
    
    Args:
        db_field: 数据库字段名
    
    Returns:
        对应的前端字段名
    """
    reverse_mapping = {v: k for k, v in FIELD_MAPPING.items()}
    return reverse_mapping.get(db_field, db_field)

# 验证配置完整性
def validate_config():
    """
    验证配置的完整性和一致性
    
    Returns:
        tuple: (is_valid, error_messages)
    """
    errors = []
    
    # 检查是否有重复的标签类型
    all_types = TAG_TYPES['multi_level'] + TAG_TYPES['single_level']
    if len(all_types) != len(set(all_types)):
        errors.append("存在重复的标签类型定义")
    
    # 检查映射的一致性
    for frontend_field, db_field in FIELD_MAPPING.items():
        # 可以添加更多验证逻辑
        pass
    
    return len(errors) == 0, errors

# 配置导出（用于前端）
def export_config_for_frontend():
    """
    导出配置供前端使用
    
    Returns:
        dict: 前端可用的配置信息
    """
    return {
        'tag_types': TAG_TYPES,
        'field_mapping': FIELD_MAPPING,
        'model_attributes': MODEL_ATTRIBUTE_FIELDS,
        'composition_fields': COMPOSITION_FIELDS,
        'special_types': SPECIAL_TAG_TYPES
    }