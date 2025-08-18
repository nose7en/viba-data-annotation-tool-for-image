CREATE TABLE viba.reference_images (
    id BIGSERIAL PRIMARY KEY,
    unique_id UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL, 
    reference_image_url TEXT NOT NULL, 
    
    
    reference_type INTEGER NOT NULL,       -- 1 代表生成图，2 代表现有的图
    -- 生成图专用字段
    gen_pose_images TEXT[],                    -- optional 仅生成图时候填写，代表作为生成图时候使用的姿势相关的图片 作为模型input
    gen_pose_description TEXT,                 -- optional 仅生成图时候填写，代表作为生成图时候使用的姿势相关的描述 作为模型input
    gen_product_images TEXT[],                  -- optional 仅生成图时候填写，代表作为生成图时候使用的服装相关的图片 作为模型input
    gen_product_description TEXT,               -- optional 仅生成图时候填写，代表作为生成图时候使用的服装相关的描述 作为模型input
    gen_occasion_images TEXT[],                   -- optional 仅生成图时候填写，代表作为生成图时候使用的场景相关的图片 作为模型input
    gen_occasion_description TEXT,                -- optional 仅生成图时候填写，代表作为生成图时候使用的场景相关的描述 作为模型input
    gen_composition_images TEXT[],             -- optional 仅生成图时候填写，代表作为生成图时候使用的构图相关的图片 作为模型input
    gen_composition_description TEXT,          -- optional 仅生成图时候填写，代表作为生成图时候使用的构图相关的描述 作为模型input
    -- 注意，这个style不是衣服的style，而是整个图的style
    gen_style_images TEXT[],                   -- optional 仅生成图时候填写，代表作为生成图时候使用的风格相关的描述 作为模型input
    gen_style_description TEXT,                -- optional 仅生成图时候填写，代表作为生成图时候使用的风格相关的描述 作为模型input
    gen_content_prompt TEXT,                   -- optional 仅生成图时候填写，代表最终的text prompt
    gen_ml_model_source TEXT,                  -- optional 仅生成图时候填写，代表如何使用content prompt和
    -- 匹配图专用字段
    product_item_ids UUID[],               -- optional 仅匹配图时候填写，如果说现有图上面有真的商品，那么需要先落入商品库，再把商品id写入
    can_be_used_for_face_switching boolean,-- optional 仅匹配图时候填写，如果这张图可以直接被用于换脸
    pose_description TEXT,                 -- optional 仅匹配图时候填写，表示对于这张现有图的姿势文字描述
    scene_description TEXT,                -- optional 仅匹配图时候填写，表示对于这张现有图的尝尽文字描述
    
    -- 修改：使用标签ID而不是文本，注意这里在打标签的时候，需要把需要打的标签的所有
    -- 父级标签也都打进去，并且做去重
    -- 注意，以下标签都是针对参考图的标签描述，而不是对于衣服商品的描述
    product_type_tag_ids BIGINT[],                 -- 关联商品类别标签表的ID
    style_tag_ids BIGINT[],                        -- 关联参考图风格的ID
    occasion_tag_ids BIGINT[],                     -- 关联场合标签表的ID
    silhouette_tag_ids BIGINT[],                   -- 关联版型标签ID
    model_attribute_tag_ids BIGINT[],              -- 关联模特属性标签ID
    fabric_tag_ids BIGINT[],                       -- 关联材质标签ID
    pose_tag_ids BIGINT[],                         -- 关联姿势标签表的ID
    composition_tag_ids BIGINT[],

    -- 新增：服装详细信息，这里是为了建立每件衣服的独立描述    
    outfit_details JSONB,                               
    /* 结构示例：    
    [        
        {            
            "product_type_tag_id": 123,     -- T恤
            "fabric_tag_id": 456,          -- 亚麻
            "silhouette_tag_id": 789              -- 修身
        },        
        {    
            "product_type_tag_id": 234,     -- 短裤
            "fabric_tag_id": 567,          -- 棉
            "silhouette_tag_id": 890              -- 宽松
        }    
    ]    
    */
    
    -- 向量表示，在description和tag上面做embedding（这里不做style的索引是因为这是style是用来描述场景的）
    gen_content_embedding vector(768),
    gen_pose_embedding vector(384),
    gen_product_embedding vector(384),
    gen_occasion_embedding vector(384),
    gen_composition_embedding vector(384),
    pose_embedding vector(384),
    scene_embedding vector(384),
    
    -- 搜索文本
    search_text TEXT GENERATED ALWAYS AS (
        COALESCE(gen_pose_description, '') || ' ' ||
        COALESCE(gen_outfit_description, '') || ' ' ||
        COALESCE(gen_scene_description, '') || ' ' ||
        COALESCE(gen_composition_description, '') || ' ' || 
        COALESCE(gen_style_description, '') || ' ' ||
        COALESCE(pose_description, '') || ' ' || 
        COALESCE(scene_description, '') || ' ' || 
        COALESCE(gen_content_prompt, '')
    ) STORED,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 所有description部分的向量都需要做索引
-- gen content prompt的index
CREATE INDEX idx_ref_content_embedding ON viba.reference_images 
USING ivfflat (gen_content_embedding vector_cosine_ops) WITH (lists = 100);

-- gen pose description的index
CREATE INDEX idx_ref_pose_embedding ON viba.reference_images 
USING ivfflat (gen_pose_embedding vector_cosine_ops) WITH (lists = 100);

-- gen_outfit_desctiption
CREATE INDEX idx_ref_outfit_embedding ON viba.reference_images 
USING ivfflat (gen_outfit_embedding vector_cosine_ops) WITH (lists = 100);

-- gen_scene_description
CREATE INDEX idx_ref_scene_embedding ON viba.reference_images 
USING ivfflat (gen_scene_embedding vector_cosine_ops) WITH (lists = 100);

-- gen_composition_description
CREATE INDEX idx_ref_composition_embedding ON reference_images 
USING ivfflat (gen_composition_embedding vector_cosine_ops) WITH (lists = 100); 

-- pose_description
CREATE INDEX idx_ref_composition_embedding ON reference_images 
USING ivfflat (pose_embedding vector_cosine_ops) WITH (lists = 100); 

-- scene_description
CREATE INDEX idx_ref_composition_embedding ON reference_images 
USING ivfflat (scene_embedding vector_cosine_ops) WITH (lists = 100); 

-- 标签ID数组索引
CREATE INDEX idx_ref_pose_tags ON viba.reference_images USING GIN(pose_tag_ids);
CREATE INDEX idx_ref_occasion_tags ON viba.reference_images USING GIN(occasion_tag_ids);
CREATE INDEX idx_ref_outfit_type_tags ON viba.reference_images USING GIN(product_type_tag_ids);
CREATE INDEX idx_ref_model_attr_tags ON viba.reference_images USING GIN(model_attribute_tag_ids);
CREATE INDEX idx_ref_fabric_tags ON viba.reference_images USING GIN(fabric_tag_ids);
CREATE INDEX idx_ref_silhouette_tags ON viba.reference_images USING GIN(silhouette_tag_ids); 
CREATE INDEX idx_ref_outfit_details ON viba.reference_images USING GIN(outfit_details);

-- 其他索引
CREATE INDEX idx_ref_type ON viba.reference_images(reference_type);
CREATE INDEX idx_ref_search_text ON viba.reference_images USING GIN(to_tsvector('english', search_text));

-- 这是所有我曾经做过的重命名和增加column
ALTER TABLE viba.reference_images RENAME COLUMN outfit_type_tag_ids TO product_type_tag_ids;
ALTER TABLE viba.reference_images RENAME COLUMN fit_tag_ids TO silhouette_tag_ids;
ALTER TABLE viba.reference_images RENAME COLUMN scene_tag_ids TO occasion_tag_ids;
ALTER TABLE viba.reference_images RENAME COLUMN gen_outfit_images TO gen_product_images;
ALTER TABLE viba.reference_images RENAME COLUMN gen_outfit_description TO gen_product_description;
ALTER TABLE viba.reference_images RENAME COLUMN gen_scene_images TO gen_occasion_images;
ALTER TABLE viba.reference_images RENAME COLUMN gen_scene_description TO gen_occasion_description;
ALTER TABLE viba.reference_images RENAME COLUMN gen_scene_embedding TO gen_occasion_embedding;
ALTER TABLE viba.reference_images RENAME COLUMN gen_outfit_embedding TO gen_product_embedding;

ALTER TABLE viba.reference_images ADD COLUMN style_tag_ids BIGINT[];
ALTER TABLE viba.reference_images ADD COLUMN composition_tag_ids BIGINT[];

ALTER INDEX idx_ref_scene_tags RENAME TO idx_ref_occasion_tags;
ALTER INDEX idx_ref_outfit_type_tags RENAME TO idx_ref_product_type_tags;
ALTER INDEX idx_ref_fit_tags RENAME TO idx_ref_silhouette_tags;