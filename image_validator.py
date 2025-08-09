# image_validator.py
from PIL import Image
import io
import logging
from typing import Tuple, Optional, Dict, Any

logger = logging.getLogger(__name__)

class ImageValidator:
    """图片验证服务，专门处理竖屏图片验证"""
    
    # 竖屏图片的分辨率要求
    MIN_WIDTH = 1080
    MIN_HEIGHT = 1920
    MAX_WIDTH = 2160
    MAX_HEIGHT = 3840
    
    # 支持的格式
    ALLOWED_FORMATS = {'PNG', 'JPEG', 'JPG'}
    
    # 文件大小限制
    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
    
    @classmethod
    def validate_image(cls, file_data: bytes) -> Dict[str, Any]:
        """
        验证图片是否符合要求
        
        Args:
            file_data: 图片文件的二进制数据
            
        Returns:
            包含验证结果的字典
        """
        try:
            # 检查文件大小
            file_size = len(file_data)
            if file_size > cls.MAX_FILE_SIZE:
                return {
                    'valid': False,
                    'error': f'文件大小超过限制（最大{cls.MAX_FILE_SIZE // (1024*1024)}MB）'
                }
            
            # 打开图片
            img = Image.open(io.BytesIO(file_data))
            
            # 检查格式
            if img.format not in cls.ALLOWED_FORMATS:
                return {
                    'valid': False,
                    'error': f'不支持的图片格式，请使用{", ".join(cls.ALLOWED_FORMATS)}'
                }
            
            # 获取尺寸
            width, height = img.size
            
            # 检查是否为竖屏
            if width >= height:
                return {
                    'valid': False,
                    'error': '请上传竖屏图片（高度应大于宽度）'
                }
            
            # 检查最小分辨率
            if width < cls.MIN_WIDTH or height < cls.MIN_HEIGHT:
                return {
                    'valid': False,
                    'error': f'竖屏图片分辨率过低，最小要求为{cls.MIN_WIDTH}×{cls.MIN_HEIGHT}'
                }
            
            # 检查最大分辨率
            if width > cls.MAX_WIDTH or height > cls.MAX_HEIGHT:
                return {
                    'valid': False,
                    'error': f'竖屏图片分辨率过高，最大限制为{cls.MAX_WIDTH}×{cls.MAX_HEIGHT}'
                }
            
            # 计算宽高比
            aspect_ratio = width / height
            
            return {
                'valid': True,
                'width': width,
                'height': height,
                'format': img.format,
                'mode': img.mode,
                'aspect_ratio': aspect_ratio,
                'file_size': file_size,
                'file_size_mb': round(file_size / (1024 * 1024), 2)
            }
            
        except Exception as e:
            logger.error(f"Error validating image: {str(e)}")
            return {
                'valid': False,
                'error': f'图片验证失败：{str(e)}'
            }
    
    @classmethod
    def get_image_info(cls, file_path: str) -> Optional[Dict[str, Any]]:
        """
        获取图片信息
        
        Args:
            file_path: 图片文件路径
            
        Returns:
            图片信息字典或None
        """
        try:
            with Image.open(file_path) as img:
                width, height = img.size
                return {
                    'width': width,
                    'height': height,
                    'format': img.format,
                    'mode': img.mode,
                    'is_portrait': width < height,
                    'aspect_ratio': width / height
                }
        except Exception as e:
            logger.error(f"Error getting image info: {str(e)}")
            return None
    
    @classmethod
    def compress_image(cls, file_data: bytes, quality: int = 85) -> bytes:
        """
        压缩图片
        
        Args:
            file_data: 原始图片数据
            quality: 压缩质量（1-100）
            
        Returns:
            压缩后的图片数据
        """
        try:
            img = Image.open(io.BytesIO(file_data))
            
            # 如果是PNG且包含透明通道，转换为JPEG时需要处理
            if img.format == 'PNG' and img.mode in ('RGBA', 'LA'):
                # 创建白色背景
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'RGBA':
                    background.paste(img, mask=img.split()[3])  # 使用alpha通道作为mask
                else:
                    background.paste(img)
                img = background
            
            # 保存压缩后的图片
            output = io.BytesIO()
            img.save(output, format='JPEG', quality=quality, optimize=True)
            return output.getvalue()
            
        except Exception as e:
            logger.error(f"Error compressing image: {str(e)}")
            return file_data  # 返回原始数据
    
    @classmethod
    def resize_image_if_needed(cls, file_data: bytes) -> bytes:
        """
        如果图片超过最大尺寸，按比例缩小
        
        Args:
            file_data: 原始图片数据
            
        Returns:
            处理后的图片数据
        """
        try:
            img = Image.open(io.BytesIO(file_data))
            width, height = img.size
            
            # 检查是否需要缩放
            if width <= cls.MAX_WIDTH and height <= cls.MAX_HEIGHT:
                return file_data
            
            # 计算缩放比例
            width_ratio = cls.MAX_WIDTH / width
            height_ratio = cls.MAX_HEIGHT / height
            ratio = min(width_ratio, height_ratio)
            
            # 计算新尺寸
            new_width = int(width * ratio)
            new_height = int(height * ratio)
            
            # 缩放图片
            img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            
            # 保存缩放后的图片
            output = io.BytesIO()
            img.save(output, format=img.format or 'JPEG', quality=95, optimize=True)
            return output.getvalue()
            
        except Exception as e:
            logger.error(f"Error resizing image: {str(e)}")
            return file_data