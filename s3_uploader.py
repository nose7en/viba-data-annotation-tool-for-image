# s3_uploader.py - 修复后的S3上传服务
import boto3
import uuid
import os
from datetime import datetime
from typing import Optional, List, Dict
import hashlib
import logging

logger = logging.getLogger(__name__)

class S3Uploader:
    """
    简化的S3上传服务
    直接返回URL，不需要映射表
    """
    
    def __init__(self, bucket_name: str, region: str, 
                 access_key_id: str, secret_access_key: str,
                 cloudfront_domain: Optional[str] = None):
        """
        初始化S3上传器
        
        Args:
            bucket_name: S3存储桶名称
            region: AWS区域
            access_key_id: AWS访问密钥ID
            secret_access_key: AWS访问密钥
            cloudfront_domain: CloudFront域名（可选，用于CDN加速）
        """
        self.bucket_name = bucket_name
        self.region = region
        self.cloudfront_domain = cloudfront_domain
        
        # 初始化S3客户端
        self.s3_client = boto3.client(
            's3',
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            region_name=region
        )
        
        # 定义文件夹路径模板
        self.path_templates = {
            # 主业务图片 - 模型参考图
            'reference_image': 'reference_images/{year}/{month}/{day}/{filename}',
            
            # AI生成参考图 - 各类参考图
            'prompt_pose': 'prompt_references/pose/{year}/{month}/{filename}',
            'prompt_outfit': 'prompt_references/outfit/{year}/{month}/{filename}',
            'prompt_scene': 'prompt_references/scene/{year}/{month}/{filename}',
            'prompt_composition': 'prompt_references/composition/{year}/{month}/{filename}',
            'prompt_style': 'prompt_references/style/{year}/{month}/{filename}'
        }
    
    def generate_s3_path(self, file_type: str) -> str:
        """
        生成S3存储路径
        
        Args:
            file_type: 文件类型
        
        Returns:
            S3完整路径
        """
        if file_type not in self.path_templates:
            raise ValueError(f"Invalid file type: {file_type}")
        
        now = datetime.now()
        filename = f"{uuid.uuid4().hex}.jpg"
        
        path = self.path_templates[file_type].format(
            year=now.strftime('%Y'),
            month=now.strftime('%m'),
            day=now.strftime('%d'),
            filename=filename
        )
        
        return path
    
    def upload_file(self, file_data: bytes, file_type: str,
                   content_type: str = 'image/jpeg') -> str:
        """
        上传文件到S3并返回URL
        
        Args:
            file_data: 文件二进制数据
            file_type: 文件类型 ('reference_image', 'prompt_pose', 等)
            content_type: MIME类型
        
        Returns:
            文件的公开访问URL
        """
        try:
            # 生成S3路径
            s3_path = self.generate_s3_path(file_type)
            
            # 上传到S3
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=s3_path,
                Body=file_data,
                ContentType=content_type,
                # 设置为公开读取（如果需要）
                # ACL='public-read',
                # 添加元数据
                Metadata={
                    'upload_time': datetime.now().isoformat(),
                    'file_type': file_type
                }
            )
            
            # 生成访问URL
            if self.cloudfront_domain:
                # 使用CloudFront CDN
                url = f"https://{self.cloudfront_domain}/{s3_path}"
            else:
                # 使用S3直接URL
                url = f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{s3_path}"
            
            logger.info(f"Successfully uploaded file to S3: {s3_path}")
            return url
            
        except Exception as e:
            logger.error(f"Failed to upload file to S3: {str(e)}")
            raise
    
    def upload_batch(self, files: List[Dict]) -> List[str]:
        """
        批量上传文件
        
        Args:
            files: 文件列表，每个元素包含 {'data': bytes, 'type': str}
        
        Returns:
            URL列表
        """
        urls = []
        for file_info in files:
            try:
                url = self.upload_file(
                    file_data=file_info['data'],
                    file_type=file_info['type']
                )
                urls.append(url)
            except Exception as e:
                logger.error(f"Failed to upload file in batch: {str(e)}")
                urls.append(None)
        
        return urls
    
    def delete_file_by_url(self, url: str) -> bool:
        """
        通过URL删除S3文件
        
        Args:
            url: 文件URL
        
        Returns:
            是否删除成功
        """
        try:
            # 从URL提取S3 key
            s3_key = self.extract_s3_key_from_url(url)
            if not s3_key:
                return False
            
            # 删除S3对象
            self.s3_client.delete_object(
                Bucket=self.bucket_name,
                Key=s3_key
            )
            
            logger.info(f"Successfully deleted file from S3: {s3_key}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete file: {str(e)}")
            return False
    
    def extract_s3_key_from_url(self, url: str) -> Optional[str]:
        """
        从URL中提取S3 key
        
        Args:
            url: S3 URL或CloudFront URL
        
        Returns:
            S3 key或None
        """
        try:
            if self.cloudfront_domain and self.cloudfront_domain in url:
                # CloudFront URL
                return url.split(f"https://{self.cloudfront_domain}/")[1]
            elif f"{self.bucket_name}.s3" in url:
                # S3 URL
                return url.split(f"{self.bucket_name}.s3.{self.region}.amazonaws.com/")[1]
            else:
                return None
        except:
            return None
    
    def create_folder_structure(self):
        """
        在S3中创建文件夹结构（可选）
        """
        folders = [
            'reference_images/',
            'prompt_references/',
            'prompt_references/pose/',
            'prompt_references/outfit/',
            'prompt_references/scene/',
            'prompt_references/composition/',
            'prompt_references/style/'
        ]
        
        for folder in folders:
            try:
                # 检查文件夹是否已存在
                self.s3_client.head_object(
                    Bucket=self.bucket_name,
                    Key=f"{folder}.keep"
                )
                logger.info(f"Folder already exists: {folder}")
            except:
                # 文件夹不存在，创建它
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
    
    def generate_presigned_url(self, url: str, expires_in: int = 3600) -> Optional[str]:
        """
        为私有文件生成预签名URL
        
        Args:
            url: 原始URL
            expires_in: 过期时间（秒）
        
        Returns:
            预签名URL
        """
        try:
            s3_key = self.extract_s3_key_from_url(url)
            if not s3_key:
                return None
            
            presigned_url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': self.bucket_name,
                    'Key': s3_key
                },
                ExpiresIn=expires_in
            )
            
            return presigned_url
        except Exception as e:
            logger.error(f"Failed to generate presigned URL: {str(e)}")
            return None