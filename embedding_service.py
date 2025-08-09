# embedding_service.py
import logging
from typing import List, Optional
import numpy as np

logger = logging.getLogger(__name__)

class EmbeddingService:
    """向量嵌入服务，用于生成文本的向量表示"""
    
    def __init__(self):
        self.model = None
        self.available = False
        self._load_model()
    
    def _load_model(self):
        """加载嵌入模型"""
        try:
            from sentence_transformers import SentenceTransformer
            # 使用多语言模型，支持中英文
            self.model = SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')
            self.available = True
            logger.info("Successfully loaded embedding model")
        except Exception as e:
            logger.warning(f"Failed to load embedding model: {str(e)}. Embeddings will be disabled.")
            self.available = False
    
    def generate_embedding(self, text: str, dimension: int = 768) -> Optional[List[float]]:
        """
        生成文本的向量嵌入
        
        Args:
            text: 输入文本
            dimension: 向量维度（768或384）
        
        Returns:
            向量列表或None
        """
        if not text or not text.strip():
            return None
        
        if not self.available:
            # 返回mock向量用于测试
            logger.debug("Embedding model not available, returning mock vector")
            return [0.0] * dimension
        
        try:
            # 生成嵌入
            embedding = self.model.encode(text, normalize_embeddings=True)
            
            # 调整维度
            if dimension == 384 and len(embedding) == 768:
                # 通过简单截断降维
                embedding = embedding[:384]
            elif dimension == 768 and len(embedding) == 384:
                # 填充到768维
                embedding = np.pad(embedding, (0, 768 - 384), 'constant')
            
            return embedding.tolist()
        except Exception as e:
            logger.error(f"Error generating embedding: {str(e)}")
            return None
    
    def generate_batch_embeddings(self, texts: List[str], dimension: int = 768) -> List[Optional[List[float]]]:
        """
        批量生成文本的向量嵌入
        
        Args:
            texts: 文本列表
            dimension: 向量维度
        
        Returns:
            向量列表
        """
        if not texts:
            return []
        
        if not self.available:
            # 返回mock向量列表
            return [[0.0] * dimension for _ in texts]
        
        try:
            # 过滤空文本
            valid_texts = [t for t in texts if t and t.strip()]
            if not valid_texts:
                return [None] * len(texts)
            
            # 批量生成嵌入
            embeddings = self.model.encode(valid_texts, normalize_embeddings=True, batch_size=32)
            
            # 创建结果映射
            result = []
            valid_idx = 0
            for text in texts:
                if text and text.strip():
                    embedding = embeddings[valid_idx]
                    
                    # 调整维度
                    if dimension == 384 and len(embedding) == 768:
                        embedding = embedding[:384]
                    elif dimension == 768 and len(embedding) == 384:
                        embedding = np.pad(embedding, (0, 768 - 384), 'constant')
                    
                    result.append(embedding.tolist())
                    valid_idx += 1
                else:
                    result.append(None)
            
            return result
        except Exception as e:
            logger.error(f"Error generating batch embeddings: {str(e)}")
            return [None] * len(texts)
    
    def compute_similarity(self, embedding1: List[float], embedding2: List[float]) -> float:
        """
        计算两个向量的余弦相似度
        
        Args:
            embedding1: 第一个向量
            embedding2: 第二个向量
        
        Returns:
            相似度分数（0-1）
        """
        try:
            vec1 = np.array(embedding1)
            vec2 = np.array(embedding2)
            
            # 计算余弦相似度
            dot_product = np.dot(vec1, vec2)
            norm1 = np.linalg.norm(vec1)
            norm2 = np.linalg.norm(vec2)
            
            if norm1 == 0 or norm2 == 0:
                return 0.0
            
            similarity = dot_product / (norm1 * norm2)
            return float(similarity)
        except Exception as e:
            logger.error(f"Error computing similarity: {str(e)}")
            return 0.0

# 创建全局实例
embedding_service = EmbeddingService()