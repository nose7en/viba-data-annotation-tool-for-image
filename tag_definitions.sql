CREATE TABLE viba.tag_definitions (
    id BIGSERIAL PRIMARY KEY,
    
    -- 标签基础信息
    tag_type VARCHAR(50) NOT NULL,                 -- 'pose', 'scene', 'style', 'outfit_type'
    tag_name VARCHAR(100) NOT NULL,
    tag_name_cn VARCHAR(100) NOT NULL,             -- 中文名称
    aliases TEXT[],                                -- 标签别名
    
    parent_tag_id BIGINT,                          -- 父标签ID，支持树形结构
    level INTEGER NOT NULL DEFAULT 1,              -- 层级，根节点为1
    path TEXT,                                     -- 完整路径，如 "服装/上装/T恤"
    
    -- 层级编码     
    level1_code VARCHAR(2),                        -- 一级编码 01-99，00表示没有此级标签
    level2_code VARCHAR(2),                        -- 二级编码 01-99，00表示没有此级标签
    level3_code VARCHAR(2),                        -- 三级编码 01-99，00表示没有此级标签
    level4_code VARCHAR(8),                        -- 四级编码 00000001-99999999
    full_code VARCHAR(14) GENERATED ALWAYS AS (    -- 完整编码（自动生成）
         COALESCE(level1_code, '00') ||          
         COALESCE(level2_code, '00') ||          
         COALESCE(level3_code, '00') ||          
         COALESCE(level4_code, '00000000')     
     ) STORED,
    
    -- 搜索优化
    search_text TEXT GENERATED ALWAYS AS (     
        tag_name || ' ' ||      
        tag_name_cn || ' ' ||      
        COALESCE(array_to_string(aliases, ' '), '') 
    ) STORED;
    
    description TEXT,                              -- 标签描述
    embedding vector(384),                         -- 标签的向量表示，主要是使用描述的向量
    is_active BOOLEAN DEFAULT TRUE,                -- 是否启用 
    is_leaf   BOOLEAN DEFAULT TRUE,                -- 是否叶子节点（最后一级标签）
    attributes JSONB,                              -- 标签特定属性，结构因tag_type而不同

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(tag_type, tag_name),
    FOREIGN KEY (parent_tag_id) REFERENCES viba.tag_definitions(id)
);

-- 索引
CREATE INDEX idx_tag_def_type ON viba.tag_definitions(tag_type); 
CREATE INDEX idx_tag_def_parent ON viba.tag_definitions(parent_tag_id); 
CREATE INDEX idx_tag_def_level ON viba.tag_definitions(level); 
CREATE INDEX idx_tag_def_full_code ON viba.tag_definitions(full_code); 
CREATE INDEX idx_tag_def_type_code ON viba.tag_definitions(tag_type, full_code); 
-- 建立Btree构建前缀查询
/* 比如
SELECT * FROM tag_definitions 
WHERE full_code LIKE '01%'  -- 前缀匹配（不能有通配符在前面）
*/
CREATE INDEX idx_tag_def_code_prefix ON viba.tag_definitions(full_code varchar_pattern_ops); 
CREATE INDEX idx_tag_def_active ON viba.tag_definitions(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_tag_attributes ON viba.tag_definitions USING GIN(attributes);
CREATE INDEX idx_tag_def_aliases ON viba.tag_definitions USING GIN(aliases); 
CREATE INDEX idx_tag_search_text ON viba.tag_definitions USING GIN(to_tsvector('simple', search_text));

-- 向量索引
CREATE INDEX idx_tag_def_embedding ON viba.tag_definitions USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50); 