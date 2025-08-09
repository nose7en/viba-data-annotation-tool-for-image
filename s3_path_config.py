# s3_path_config.py - 可配置的S3路径设置
import os
from datetime import datetime

class S3PathConfig:
    """S3路径配置类，支持环境变量配置"""
    
    def __init__(self):
        # 从环境变量读取基础路径，如果没有则使用默认值
        self.base_paths = {
            'reference_image': os.environ.get('S3_PATH_REFERENCE', 'reference_images'),
            'prompt_base': os.environ.get('S3_PATH_PROMPT_BASE', 'prompt_references')
        }
        
        # 是否按日期组织文件
        self.use_date_folders = os.environ.get('S3_USE_DATE_FOLDERS', 'true').lower() == 'true'
        
        # 日期格式
        self.date_format = os.environ.get('S3_DATE_FORMAT', 'year/month/day')  # 或 'year/month' 或 'year-month-day'
    
    def get_path_templates(self):
        """获取路径模板"""
        date_path = self.get_date_path()
        
        return {
            # 主业务图片
            'reference_image': f"{self.base_paths['reference_image']}/{date_path}/{{filename}}" if self.use_date_folders 
                             else f"{self.base_paths['reference_image']}/{{filename}}",
            
            # AI参考图
            'prompt_pose': f"{self.base_paths['prompt_base']}/pose/{date_path}/{{filename}}" if self.use_date_folders
                         else f"{self.base_paths['prompt_base']}/pose/{{filename}}",
            
            'prompt_outfit': f"{self.base_paths['prompt_base']}/outfit/{date_path}/{{filename}}" if self.use_date_folders
                           else f"{self.base_paths['prompt_base']}/outfit/{{filename}}",
            
            'prompt_scene': f"{self.base_paths['prompt_base']}/scene/{date_path}/{{filename}}" if self.use_date_folders
                          else f"{self.base_paths['prompt_base']}/scene/{{filename}}",
            
            'prompt_composition': f"{self.base_paths['prompt_base']}/composition/{date_path}/{{filename}}" if self.use_date_folders
                                else f"{self.base_paths['prompt_base']}/composition/{{filename}}",
            
            'prompt_style': f"{self.base_paths['prompt_base']}/style/{date_path}/{{filename}}" if self.use_date_folders
                          else f"{self.base_paths['prompt_base']}/style/{{filename}}"
        }
    
    def get_date_path(self):
        """根据配置生成日期路径"""
        now = datetime.now()
        
        if self.date_format == 'year/month/day':
            return f"{now.year}/{now.month:02d}/{now.day:02d}"
        elif self.date_format == 'year/month':
            return f"{now.year}/{now.month:02d}"
        elif self.date_format == 'year-month-day':
            return now.strftime('%Y-%m-%d')
        elif self.date_format == 'year-month':
            return now.strftime('%Y-%m')
        else:
            return now.strftime('%Y/%m/%d')
    
    def get_folder_list(self):
        """获取需要创建的文件夹列表"""
        folders = [
            self.base_paths['reference_image'] + '/',
            self.base_paths['prompt_base'] + '/',
            f"{self.base_paths['prompt_base']}/pose/",
            f"{self.base_paths['prompt_base']}/outfit/",
            f"{self.base_paths['prompt_base']}/scene/",
            f"{self.base_paths['prompt_base']}/composition/",
            f"{self.base_paths['prompt_base']}/style/"
        ]
        return folders

# 在 s3_uploader.py 中使用
class S3Uploader:
    def __init__(self, bucket_name: str, region: str, 
                 access_key_id: str, secret_access_key: str,
                 cloudfront_domain: Optional[str] = None):
        # ... 其他初始化代码 ...
        
        # 使用配置类
        self.path_config = S3PathConfig()
        self.path_templates = self.path_config.get_path_templates()
    
    def create_folder_structure(self):
        """创建文件夹结构"""
        folders = self.path_config.get_folder_list()
        
        for folder in folders:
            try:
                self.s3_client.put_object(
                    Bucket=self.bucket_name,
                    Key=f"{folder}.keep",
                    Body=b'',
                    ContentType='text/plain'
                )
                logger.info(f"Created folder structure: {folder}")
            except Exception as e:
                logger.error(f"Failed to create folder {folder}: {str(e)}")