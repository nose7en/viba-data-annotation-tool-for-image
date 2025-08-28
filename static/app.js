// app.js - 最终完整版本

// 全局变量
let mainImage = null;
let referenceImages = {
    pose: [],
    outfit: [],
    scene: [],
    composition: [],
    style: []
};
let outfitCounter = 1;
let styleTagCounter = 1;
let occasionTagCounter = 1;
let referenceImageCounters = {
    pose: 0,
    outfit: 0,
    scene: 0,
    composition: 0,
    style: 0
};

// 初始化 tagData
window.tagData = {
    multi_level: {},
    single_level: {},
    loaded: false
};

// 全局配置对象
window.tagConfig = {
    MODEL_ATTRIBUTE_FIELDS: ['model_age', 'model_gender', 'model_race', 'model_fit'],
    COMPOSITION_FIELDS: ['composition_shot', 'composition_angle', 'composition_bodyratio', 'composition_position'],
    loaded: false
};

// 页面加载完成时执行
document.addEventListener('DOMContentLoaded', async function() {
    console.log('页面加载开始');
    showLoadingState();
    
    // 并行加载配置、主题和标签数据
    const [configLoaded, themesLoaded, tagsLoaded] = await Promise.all([
        loadTagConfig(),
        loadThemesFromAPI(),
        loadTagsFromAPI()
    ]);
    
    // 初始化事件监听器
    initializeEventListeners();
    loadFromLocalStorage();
    validateForm();
    hideLoadingState();
    
    console.log('配置加载状态:', configLoaded);
    console.log('主题加载状态:', themesLoaded);
    console.log('标签加载状态:', tagsLoaded);
});

// 加载标签配置
async function loadTagConfig() {
    try {
        const response = await fetch('/api/v1/annot-image/config/tags');
        const result = await response.json();
        
        if (result.success) {
            window.tagConfig = {
                ...result.data,
                loaded: true
            };
            console.log('标签配置已加载:', window.tagConfig);
            return true;
        }
        return false;
    } catch (error) {
        console.error('加载标签配置失败:', error);
        // 使用默认配置
        return false;
    }
}

// 加载主题数据
async function loadThemesFromAPI() {
    try {
        const response = await fetch('/api/v1/annot-image/themes');
        const result = await response.json();
        
        if (result.success) {
            const themeSelect = document.getElementById('theme');
            themeSelect.innerHTML = '<option value="">请选择主题</option>';
            
            result.data.forEach(theme => {
                const option = document.createElement('option');
                option.value = theme.unique_id;
                option.textContent = theme.title;
                themeSelect.appendChild(option);
            });
            
            return true;
        }
        return false;
    } catch (error) {
        console.error('加载主题失败:', error);
        return false;
    }
}

// 加载标签数据
async function loadTagsFromAPI() {
    try {
        const response = await fetch('/api/v1/annot-image/tags/all',{
                    method:'GET'});
        const result = await response.json();
        
        if (result.success) {
            window.tagData = {
                ...result.data,
                loaded: true
            };
            
            console.log('标签数据已加载:', window.tagData);
            initializeTagSelectors();
            return true;
        }
        return false;
    } catch (error) {
        console.error('加载标签失败:', error);
        initializeFallbackTagSelectors();
        return false;
    }
}

// 初始化标签选择器
function initializeTagSelectors() {
    if (!window.tagData.loaded) {
        console.warn('标签数据未加载');
        return;
    }

    initializeStyleSelectors();
    initializeOccasionSelectors();
    initializeModelAttributeSelectors();
    initializePoseTagSelector();
    initializeCompositionSelectors();
    
    // 启用按钮
    document.getElementById('addStyleTagBtn').disabled = false;
    document.getElementById('addOccasionTagBtn').disabled = false;
    document.getElementById('addOutfitBtn').disabled = false;
}

// 初始化风格标签选择器
function initializeStyleSelectors() {
    const styleContainer = document.querySelector('#styleTag0');
    if (!styleContainer) return;
    
    // 确保有 level3-container
    if (!styleContainer.querySelector('.level3-container')) {
        const level3Container = document.createElement('div');
        level3Container.className = 'level3-container';
        styleContainer.appendChild(level3Container);
    }
    
    const styleLevel1Select = styleContainer.querySelector('select[name="style_level1"]');
    if (styleLevel1Select && window.tagData.multi_level.style) {
        const styleData = window.tagData.multi_level.style;
        styleLevel1Select.innerHTML = '<option value="">选择一级风格</option>';
        
        if (styleData.cascade && styleData.cascade.level1) {
            styleData.cascade.level1.forEach(tag => {
                const option = document.createElement('option');
                option.value = tag.value;
                option.textContent = tag.label;
                styleLevel1Select.appendChild(option);
            });
        }
    }
}

// 初始化场合标签选择器
function initializeOccasionSelectors() {
    const occasionContainer = document.querySelector('#occasionTag0');
    if (!occasionContainer) return;
    
    // 确保有 level3-container
    if (!occasionContainer.querySelector('.level3-container')) {
        const level3Container = document.createElement('div');
        level3Container.className = 'level3-container';
        occasionContainer.appendChild(level3Container);
    }
    
    const occasionLevel1Select = occasionContainer.querySelector('select[name="occasion_level1"]');
    if (occasionLevel1Select && window.tagData.multi_level.occasion) {
        const occasionData = window.tagData.multi_level.occasion;
        occasionLevel1Select.innerHTML = '<option value="">选择一级场合</option>';
        
        if (occasionData.cascade && occasionData.cascade.level1) {
            occasionData.cascade.level1.forEach(tag => {
                const option = document.createElement('option');
                option.value = tag.value;
                option.textContent = tag.label;
                occasionLevel1Select.appendChild(option);
            });
        }
    }
}

// 初始化模特属性标签选择器
function initializeModelAttributeSelectors() {
    const attributeSelectors = [
        { name: 'model_age', selector: 'select[name="model_age"]', label: '年龄' },
        { name: 'model_gender', selector: 'select[name="model_gender"]', label: '性别' },
        { name: 'model_race', selector: 'select[name="model_race"]', label: '种族' },
        { name: 'model_fit', selector: 'select[name="model_fit"]', label: '体型' }
    ];

    attributeSelectors.forEach(({ name, selector, label }) => {
        const selectElement = document.querySelector(selector);
        if (selectElement && window.tagData.single_level[name] && window.tagData.single_level[name].list) {
            selectElement.innerHTML = '<option value="">选择' + label + '</option>';
            window.tagData.single_level[name].list.forEach(tag => {
                const option = document.createElement('option');
                option.value = tag.id;
                option.textContent = tag.name_cn || tag.name;
                selectElement.appendChild(option);
            });
        }
    });
}

// 初始化构图选择器
function initializeCompositionSelectors() {
    const compositionSelectors = [
        { name: 'composition_shot', selector: 'select[name="composition_shot"]' },
        { name: 'composition_angle', selector: 'select[name="composition_angle"]' },
        { name: 'composition_bodyratio', selector: 'select[name="composition_bodyratio"]' },
        { name: 'composition_position', selector: 'select[name="composition_position"]' }
    ];

    compositionSelectors.forEach(({ name, selector }) => {
        const selectElement = document.querySelector(selector);
        if (selectElement && window.tagData.single_level[name] && window.tagData.single_level[name].list) {
            selectElement.innerHTML = '<option value="">选择</option>';
            window.tagData.single_level[name].list.forEach(tag => {
                const option = document.createElement('option');
                option.value = tag.id;
                option.textContent = tag.name_cn || tag.name;
                selectElement.appendChild(option);
            });
        }
    });
}

// 初始化姿态标签选择器
function initializePoseTagSelector() {
    const poseTagSelect = document.getElementById('poseTag');
    if (poseTagSelect && window.tagData.single_level.pose && window.tagData.single_level.pose.list) {
        poseTagSelect.innerHTML = '<option value="">选择姿态标签</option>';
        window.tagData.single_level.pose.list.forEach(tag => {
            const option = document.createElement('option');
            option.value = tag.id;
            option.textContent = tag.name_cn || tag.name;
            poseTagSelect.appendChild(option);
        });
    }
}

// Fallback初始化函数
function initializeFallbackTagSelectors() {
    console.warn('使用 fallback 数据');
}

// Modified handleSubmit function
async function handleSubmit(e) {
    e.preventDefault();
    
    // Basic validation
    if (!mainImage) {
        alert('请先上传主图');
        return;
    }
    
    const referenceType = document.querySelector('input[name="reference_type"]:checked');
    if (!referenceType) {
        alert('请选择图片类型');
        return;
    }
    
    const submitButton = document.getElementById('submitButton');
    const originalText = submitButton.textContent;
    
    try {
        submitButton.disabled = true;
        submitButton.textContent = '提交中...';
        
        const formData = collectFormData();
        console.log('提交的数据:', formData);
        
        const response = await fetch('/api/v1/annot-image/reference-images', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            const uuid = result.data.unique_id;
            
            // Display the UUID
            displaySubmittedUUID(uuid);
            
            alert('标注提交成功！UUID已显示在下方历史记录中。');
            
            if (confirm('是否清空表单以便继续标注？')) {
                resetForm();
            }
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('提交上传失败:', error);
        alert('提交上传失败: ' + error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = originalText;
    }
}


function updateReferenceImageDisplay(type, itemId, imageData) {
    const item = document.getElementById(itemId);
    if (!item) return;
    
    const previewContainer = item.querySelector('.image-preview-container');
    if (previewContainer) {
        previewContainer.innerHTML = `
            <img src="${imageData.url}" alt="${type}参考图">
            <button class="delete-image-btn" onclick="deleteReferenceImage('${type}', '${itemId}')">×</button>
        `;
    }
}

window.deleteReferenceImage = function(type, itemId) {
    const index = referenceImages[type].findIndex(img => img.id === itemId);
    if (index >= 0) {
        if (referenceImages[type][index].url) {
            URL.revokeObjectURL(referenceImages[type][index].url);
        }
        referenceImages[type].splice(index, 1);
    }
    
    const item = document.getElementById(itemId);
    if (item) {
        const previewContainer = item.querySelector('.image-preview-container');
        if (previewContainer) {
            previewContainer.innerHTML = `
                <input type="file" accept="image/png,image/jpeg" style="display: none;" 
                       onchange="handleReferenceImageSelect(event, '${type}', '${itemId}')">
                <div class="upload-placeholder" onclick="this.previousElementSibling.click()">
                    点击上传
                </div>
            `;
        }
    }
    
    saveToLocalStorage();
};

window.removeReferenceImage = function(type, itemId) {
    const index = referenceImages[type].findIndex(img => img.id === itemId);
    if (index >= 0) {
        if (referenceImages[type][index].url) {
            URL.revokeObjectURL(referenceImages[type][index].url);
        }
        referenceImages[type].splice(index, 1);
    }
    
    const item = document.getElementById(itemId);
    if (item) {
        item.remove();
    }
    
    saveToLocalStorage();
};

window.updateReferenceDescription = function(type, itemId, description) {
    const image = referenceImages[type].find(img => img.id === itemId);
    if (image) {
        image.description = description;
        saveToLocalStorage();
    }
};

function getTypeLabel(type) {
    const labels = {
        'pose': '姿态',
        'outfit': '服装',
        'scene': '场景',
        'composition': '构图',
        'style': '风格'
    };
    return labels[type] || type;
}

// 重置表单
function resetForm() {
    if (window.deleteMainImage) {
        window.deleteMainImage();
    }
    document.getElementById('annotationForm').reset();
    localStorage.removeItem('vibaFormData');
    location.reload();
}

// 初始化事件监听器
function initializeEventListeners() {
    // 主图上传
    const mainUploadArea = document.getElementById('mainUploadArea');
    const mainImageInput = document.getElementById('mainImageInput');

    if (mainUploadArea && mainImageInput) {
        mainUploadArea.addEventListener('click', () => mainImageInput.click());
        mainUploadArea.addEventListener('dragover', handleDragOver);
        mainUploadArea.addEventListener('drop', handleMainImageDrop);
        mainImageInput.addEventListener('change', handleMainImageSelect);
    }

    // 图片类型切换
    document.querySelectorAll('input[name="reference_type"]').forEach(radio => {
        radio.addEventListener('change', handleReferenceTypeChange);
    });

    // 表单提交
    const form = document.getElementById('annotationForm');
    if (form) {
        form.addEventListener('submit', handleSubmit);
    }

    // 级联选择器监听
    document.addEventListener('change', handleSelectChange);
    
    // 表单变化监听
    document.addEventListener('input', saveToLocalStorage);
    document.addEventListener('change', saveToLocalStorage);
}

// 处理下拉框变化
function handleSelectChange(e) {
    const target = e.target;
    
    if (target.name === 'style_level1') {
        updateStyleLevel2(target);
    } else if (target.name === 'style_level2') {
        const tagIndex = target.closest('.tag-selection').id.replace('styleTag', '');
        handleStyleLevel2Change(target, tagIndex);
    } else if (target.name === 'occasion_level1') {
        updateOccasionLevel2(target);
    } else if (target.name === 'occasion_level2') {
        const tagIndex = target.closest('.tag-selection').id.replace('occasionTag', '');
        handleOccasionLevel2Change(target, tagIndex);
    } else if (target.name === 'product_type_level1') {
        updateOutfitLevel2(target);
    } else if (target.name === 'product_type_level2') {
        updateOutfitLevel3(target);
    }
}

// 处理拖拽
function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
}

// 处理主图拖拽上传
function handleMainImageDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleMainImageFile(files[0]);
    }
}

// 处理主图选择
function handleMainImageSelect(e) {
    if (e.target.files.length > 0) {
        handleMainImageFile(e.target.files[0]);
    }
}

// 处理主图文件
// 图片尺寸验证函数
function validateImageDimensions(width, height) {
    const minWidth = 1080;
    const minHeight = 1440;
    const maxWidth = 2160;
    const maxHeight = 3840;

    // 检查是否为竖屏（高度大于宽度）
    if (height <= width) {
        return {
            valid: false,
            error: '图片必须是竖屏格式（高度大于宽度）'
        };
    }

    // 检查最小尺寸
    if (width < minWidth) {
        return {
            valid: false,
            error: `图片宽度不能少于 ${minWidth}px，当前宽度为 ${width}px`
        };
    }

    if (height < minHeight) {
        return {
            valid: false,
            error: `图片高度不能少于 ${minHeight}px，当前高度为 ${height}px`
        };
    }

    // 检查最大尺寸
    if (width > maxWidth || height > maxHeight) {
        return {
            valid: false,
            error: `图片尺寸超出限制，最大支持 ${maxWidth}×${maxHeight}，当前为 ${width}×${height}`
        };
    }

    return {
        valid: true,
        width: width,
        height: height
    };
}

// 显示错误信息函数
function showImageError(message) {
    // 移除现有的错误信息
    const existingError = document.querySelector('.image-error-message');
    if (existingError) {
        existingError.remove();
    }

    // 创建错误信息元素
    const errorDiv = document.createElement('div');
    errorDiv.className = 'image-error-message';
    errorDiv.style.cssText = `
        color: #dc3545;
        background-color: #f8d7da;
        border: 1px solid #f5c6cb;
        border-radius: 4px;
        padding: 10px;
        margin-top: 10px;
        font-size: 14px;
    `;
    errorDiv.textContent = message;

    // 将错误信息添加到上传区域下方
    const uploadArea = document.getElementById('mainUploadArea');
    uploadArea.appendChild(errorDiv);

    // 5秒后自动移除错误信息
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.parentNode.removeChild(errorDiv);
        }
    }, 5000);
}

// 验证图片文件
function validateMainImageFile(file) {
    return new Promise((resolve, reject) => {
        // 检查文件类型
        if (!file.type.match('image/(png|jpeg)')) {
            reject({
                valid: false,
                error: '请上传PNG或JPG格式的图片'
            });
            return;
        }

        // 检查文件大小（限制在10MB以内）
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            reject({
                valid: false,
                error: '图片文件大小不能超过10MB'
            });
            return;
        }

        // 创建图片对象来获取尺寸
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = function() {
            const width = this.naturalWidth;
            const height = this.naturalHeight;

            // 释放对象URL
            URL.revokeObjectURL(url);

            // 验证尺寸要求
            const validationResult = validateImageDimensions(width, height);
            
            if (validationResult.valid) {
                resolve({
                    valid: true,
                    file: file,
                    width: width,
                    height: height
                });
            } else {
                reject(validationResult);
            }
        };

        img.onerror = function() {
            URL.revokeObjectURL(url);
            reject({
                valid: false,
                error: '无法读取图片文件，请确保文件格式正确'
            });
        };

        img.src = url;
    });
}

// 处理主图文件（带验证）
async function handleMainImageFile(file) {
    // 清除之前的错误信息
    const existingError = document.querySelector('.image-error-message');
    if (existingError) {
        existingError.remove();
    }

    try {
        // 先验证图片
        const validationResult = await validateMainImageFile(file);
        
        // 验证通过，继续上传
        const formData = new FormData();
        formData.append('file', file);
        formData.append('image_type', 'reference_image');

        const response = await fetch('/api/v1/annot-image/upload-image', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            mainImage = {
                file: file,
                url: URL.createObjectURL(file),
                s3_url: result.data.url,
                cached: result.data.cached,
                image_info: result.data.image_info,
                width: validationResult.width,
                height: validationResult.height
            };

            displayMainImage();
            saveToLocalStorage();
            validateForm();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('主图处理失败:', error);
        
        // 显示错误信息
        if (error.error) {
            showImageError(error.error);
        } else {
            showImageError('主图上传失败: ' + error.message);
        }
        
        // 清空文件输入
        const input = document.getElementById('mainImageInput');
        if (input) input.value = '';
    }
}


// 显示主图
function displayMainImage() {
    const preview = document.getElementById('mainImagePreview');
    if (preview && mainImage) {
        const imageInfo = mainImage.width && mainImage.height ? 
            `<div style="
                margin-top: 10px;
                padding: 10px;
                background-color: #d4edda;
                border: 1px solid #c3e6cb;
                border-radius: 4px;
                font-size: 14px;
                color: #155724;
            ">
                <strong>图片信息：</strong><br>
                文件名：${mainImage.file.name}<br>
                尺寸：${mainImage.width} × ${mainImage.height} 像素<br>
                文件大小：${(mainImage.file.size / 1024 / 1024).toFixed(2)} MB
            </div>` : '';

        preview.innerHTML = `
            <div style="position: relative; display: inline-block;">
                <img src="${mainImage.url}" class="main-image-preview" alt="主图预览">
                <button class="delete-image-btn" onclick="deleteMainImage()" style="display: flex;">×</button>
            </div>
            ${imageInfo}
        `;
    }
}

// 删除主图
window.deleteMainImage = function() {
    mainImage = null;
    const preview = document.getElementById('mainImagePreview');
    if (preview) preview.innerHTML = '';
    const input = document.getElementById('mainImageInput');
    if (input) input.value = '';
    
    // 清除错误信息
    const existingError = document.querySelector('.image-error-message');
    if (existingError) {
        existingError.remove();
    }
    
    saveToLocalStorage();
    validateForm();
};

// 处理图片类型切换
function handleReferenceTypeChange(e) {
    const isGenerated = e.target.value === '1';
    document.getElementById('generatedSection').style.display = isGenerated ? 'block' : 'none';
    document.getElementById('matchingSection').style.display = isGenerated ? 'none' : 'block';
    validateForm();
}

// 更新风格二级标签
function updateStyleLevel2(select) {
    const container = select.parentNode;
    const level2Select = container.querySelector('select[name="style_level2"]');
    const level3Container = container.querySelector('.level3-container');
    
    if (!level2Select) return;
    
    level2Select.innerHTML = '<option value="">选择二级风格</option>';
    if (level3Container) level3Container.innerHTML = '';
    
    const selectedLevel1Id = select.value;
    if (!selectedLevel1Id) {
        level2Select.disabled = true;
        return;
    }
    
    if (window.tagData.loaded && window.tagData.multi_level.style) {
        const styleData = window.tagData.multi_level.style;
        if (styleData.cascade && styleData.cascade.level2_by_parent[selectedLevel1Id]) {
            level2Select.disabled = false;
            styleData.cascade.level2_by_parent[selectedLevel1Id].forEach(tag => {
                const option = document.createElement('option');
                option.value = tag.value;
                option.textContent = tag.label;
                level2Select.appendChild(option);
            });
        }
    }
}

// 处理风格二级标签变化 - 显示三级标签墙
window.handleStyleLevel2Change = function(select, tagIndex) {
    const container = select.parentNode;
    let level3Container = container.querySelector('.level3-container');
    
    if (!level3Container) {
        level3Container = document.createElement('div');
        level3Container.className = 'level3-container';
        container.appendChild(level3Container);
    }
    
    level3Container.innerHTML = '';
    
    const selectedLevel2Id = select.value;
    if (!selectedLevel2Id) {
        return;
    }
    
    if (window.tagData.loaded && window.tagData.multi_level.style) {
        const styleData = window.tagData.multi_level.style;
        
        if (styleData.cascade && styleData.cascade.level3_by_parent[selectedLevel2Id]) {
            const level3Tags = styleData.cascade.level3_by_parent[selectedLevel2Id];
            
            if (level3Tags.length > 0) {
                const tagWallLabel = document.createElement('label');
                tagWallLabel.textContent = '选择三级风格（可多选）：';
                tagWallLabel.style.marginTop = '10px';
                tagWallLabel.style.marginBottom = '5px';
                tagWallLabel.style.display = 'block';
                level3Container.appendChild(tagWallLabel);
                
                const tagWall = document.createElement('div');
                tagWall.className = 'tag-wall';
                tagWall.dataset.tagIndex = tagIndex;
                tagWall.dataset.level2Id = selectedLevel2Id;
                
                level3Tags.forEach(tag => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'tag-item';
                    button.textContent = tag.label;
                    button.dataset.tagId = tag.value;
                    button.onclick = () => toggleStyleTag(button, tagIndex);
                    tagWall.appendChild(button);
                });
                
                level3Container.appendChild(tagWall);
            }
        }
    }
    
    saveToLocalStorage();
};

// 切换风格标签选中状态
function toggleStyleTag(button, tagIndex) {
    button.classList.toggle('selected');
    saveToLocalStorage();
    validateForm();
}

// 更新场合二级标签
function updateOccasionLevel2(select) {
    const container = select.parentNode;
    const level2Select = container.querySelector('select[name="occasion_level2"]');
    const level3Container = container.querySelector('.level3-container');
    
    if (!level2Select) return;
    
    level2Select.innerHTML = '<option value="">选择二级场合</option>';
    if (level3Container) level3Container.innerHTML = '';
    
    const selectedLevel1Id = select.value;
    if (!selectedLevel1Id) {
        level2Select.disabled = true;
        return;
    }
    
    if (window.tagData.loaded && window.tagData.multi_level.occasion) {
        const occasionData = window.tagData.multi_level.occasion;
        if (occasionData.cascade && occasionData.cascade.level2_by_parent[selectedLevel1Id]) {
            level2Select.disabled = false;
            occasionData.cascade.level2_by_parent[selectedLevel1Id].forEach(tag => {
                const option = document.createElement('option');
                option.value = tag.value;
                option.textContent = tag.label;
                level2Select.appendChild(option);
            });
        }
    }
}

// 处理场合二级标签变化 - 显示三级标签墙
window.handleOccasionLevel2Change = function(select, tagIndex) {
    const container = select.parentNode;
    let level3Container = container.querySelector('.level3-container');
    
    if (!level3Container) {
        level3Container = document.createElement('div');
        level3Container.className = 'level3-container';
        container.appendChild(level3Container);
    }
    
    level3Container.innerHTML = '';
    
    const selectedLevel2Id = select.value;
    if (!selectedLevel2Id) {
        return;
    }
    
    if (window.tagData.loaded && window.tagData.multi_level.occasion) {
        const occasionData = window.tagData.multi_level.occasion;
        
        if (occasionData.cascade && occasionData.cascade.level3_by_parent[selectedLevel2Id]) {
            const level3Tags = occasionData.cascade.level3_by_parent[selectedLevel2Id];
            
            if (level3Tags.length > 0) {
                const tagWallLabel = document.createElement('label');
                tagWallLabel.textContent = '选择三级场合（可多选）：';
                tagWallLabel.style.marginTop = '10px';
                tagWallLabel.style.marginBottom = '5px';
                tagWallLabel.style.display = 'block';
                level3Container.appendChild(tagWallLabel);
                
                const tagWall = document.createElement('div');
                tagWall.className = 'tag-wall';
                tagWall.dataset.tagIndex = tagIndex;
                tagWall.dataset.level2Id = selectedLevel2Id;
                
                level3Tags.forEach(tag => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'tag-item';
                    button.textContent = tag.label;
                    button.dataset.tagId = tag.value;
                    button.onclick = () => toggleOccasionTag(button, tagIndex);
                    tagWall.appendChild(button);
                });
                
                level3Container.appendChild(tagWall);
            }
        }
    }
    
    saveToLocalStorage();
};

// 切换场合标签选中状态
function toggleOccasionTag(button, tagIndex) {
    button.classList.toggle('selected');
    saveToLocalStorage();
    validateForm();
}

// 更新服装二级类别
function updateOutfitLevel2(select) {
    const container = select.closest('.outfit-item');
    if (!container) return;
    
    const level2Select = container.querySelector('select[name="product_type_level2"]');
    const level3Select = container.querySelector('select[name="product_type_level3"]');
    const level4Select = container.querySelector('select[name="product_type_level4"]'); 
    
    if (!level2Select || !level3Select) return;
    
    level2Select.innerHTML = '<option value="">选择二级类别</option>';
    level3Select.innerHTML = '<option value="">选择三级类别</option>';
    if (level4Select) { // Add these lines
        level4Select.innerHTML = '<option value="">选择四级类别</option>';
        level4Select.disabled = true;
    }
    level3Select.disabled = true;
    
    const selectedLevel1Id = select.value;
    if (!selectedLevel1Id) {
        level2Select.disabled = true;
        return;
    }
    
    if (window.tagData.loaded && window.tagData.multi_level.product_type) {
        const productData = window.tagData.multi_level.product_type;
        if (productData.cascade && productData.cascade.level2_by_parent[selectedLevel1Id]) {
            level2Select.disabled = false;
            productData.cascade.level2_by_parent[selectedLevel1Id].forEach(tag => {
                const option = document.createElement('option');
                option.value = tag.value;
                option.textContent = tag.label;
                level2Select.appendChild(option);
            });
        }
    }
}

// 更新服装三级类别
function updateOutfitLevel3(select) {
    const container = select.closest('.outfit-item');
    if (!container) return;
    
    const level3Select = container.querySelector('select[name="product_type_level3"]');
    const level4Select = container.querySelector('select[name="product_type_level4"]');
    
    if (!level3Select || !level4Select) return;
    
    level3Select.innerHTML = '<option value="">选择三级类别</option>';
    level4Select.innerHTML = '<option value="">选择四级类别</option>';
    level4Select.disabled = true;
    
    const selectedLevel2Id = select.value;
    if (!selectedLevel2Id) {
        level3Select.disabled = true;
        return;
    }
    
    if (window.tagData.loaded && window.tagData.multi_level.product_type) {
        const productData = window.tagData.multi_level.product_type;
        if (productData.cascade && productData.cascade.level3_by_parent[selectedLevel2Id]) {
            level3Select.disabled = false;
            productData.cascade.level3_by_parent[selectedLevel2Id].forEach(tag => {
                const option = document.createElement('option');
                option.value = tag.value;
                option.textContent = tag.label;
                level3Select.appendChild(option);
            });
        }
    }
}

function updateOutfitLevel4(select) {
    const container = select.closest('.outfit-item');
    if (!container) return;
    
    const level4Select = container.querySelector('select[name="product_type_level4"]');
    if (!level4Select) return;
    
    level4Select.innerHTML = '<option value="">选择四级类别</option>';
    
    const selectedLevel3Id = select.value;
    if (!selectedLevel3Id) {
        level4Select.disabled = true;
        return;
    }
    
    if (window.tagData.loaded && window.tagData.multi_level.product_type) {
        const productData = window.tagData.multi_level.product_type;
        
        // Use cascade level4_by_parent data
        if (productData.cascade && productData.cascade.level4_by_parent && productData.cascade.level4_by_parent[selectedLevel3Id]) {
            const level4Options = productData.cascade.level4_by_parent[selectedLevel3Id];
            
            if (level4Options.length > 0) {
                level4Select.disabled = false;
                level4Options.forEach(tag => {
                    const option = document.createElement('option');
                    option.value = tag.value;
                    option.textContent = tag.label;
                    level4Select.appendChild(option);
                });
            } else {
                level4Select.disabled = true;
                level4Select.innerHTML = '<option value="">该分类下暂无四级类别</option>';
            }
        } else {
            level4Select.disabled = true;
            level4Select.innerHTML = '<option value="">该分类下暂无四级类别</option>';
        }
    }
}


// 切换标签选中状态
function toggleTag(button) {
    button.classList.toggle('selected');
    saveToLocalStorage();
    validateForm();
}

// 添加风格标签
window.addStyleTag = function() {
    const container = document.getElementById('styleTagsContainer');
    const newTag = document.createElement('div');
    newTag.className = 'tag-selection';
    newTag.id = 'styleTag' + styleTagCounter;
    
    let html = '<div style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 15px;">';
    html += '<button type="button" class="remove-button" onclick="removeStyleTag(' + styleTagCounter + ')" style="margin-bottom: 10px;">删除此项</button>';
    html += '<select class="form-control" name="style_level1" style="margin-bottom: 10px;" onchange="handleStyleLevel1Change(this, ' + styleTagCounter + ')">';
    html += '<option value="">选择一级风格</option>';
    html += '</select>';
    html += '<select class="form-control" name="style_level2" style="margin-bottom: 10px;" disabled onchange="handleStyleLevel2Change(this, ' + styleTagCounter + ')">';
    html += '<option value="">选择二级风格</option>';
    html += '</select>';
    html += '<div class="level3-container"></div>';
    html += '</div>';
    
    newTag.innerHTML = html;
    container.appendChild(newTag);
    
    // 填充一级风格选项
    const level1Select = newTag.querySelector('select[name="style_level1"]');
    if (window.tagData.loaded && window.tagData.multi_level.style) {
        const styleData = window.tagData.multi_level.style;
        if (styleData.cascade && styleData.cascade.level1) {
            styleData.cascade.level1.forEach(tag => {
                const option = document.createElement('option');
                option.value = tag.value;
                option.textContent = tag.label;
                level1Select.appendChild(option);
            });
        }
    }
    
    styleTagCounter++;
    saveToLocalStorage();
};

// 处理风格一级标签变化
window.handleStyleLevel1Change = function(select, tagIndex) {
    const container = select.parentNode;
    const level2Select = container.querySelector('select[name="style_level2"]');
    const level3Container = container.querySelector('.level3-container');
    
    level2Select.innerHTML = '<option value="">选择二级风格</option>';
    if (level3Container) level3Container.innerHTML = '';
    level2Select.disabled = true;
    
    const selectedLevel1Id = select.value;
    if (!selectedLevel1Id) {
        return;
    }
    
    if (window.tagData.loaded && window.tagData.multi_level.style) {
        const styleData = window.tagData.multi_level.style;
        if (styleData.cascade && styleData.cascade.level2_by_parent[selectedLevel1Id]) {
            level2Select.disabled = false;
            styleData.cascade.level2_by_parent[selectedLevel1Id].forEach(tag => {
                const option = document.createElement('option');
                option.value = tag.value;
                option.textContent = tag.label;
                level2Select.appendChild(option);
            });
        }
    }
    
    saveToLocalStorage();
};

// 删除风格标签
window.removeStyleTag = function(id) {
    const element = document.getElementById('styleTag' + id);
    if (element) {
        element.remove();
        saveToLocalStorage();
        validateForm();
    }
};

// 添加场合标签
window.addOccasionTag = function() {
    const container = document.getElementById('occasionTagsContainer');
    const newTag = document.createElement('div');
    newTag.className = 'tag-selection';
    newTag.id = 'occasionTag' + occasionTagCounter;
    
    let html = '<div style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 15px;">';
    html += '<button type="button" class="remove-button" onclick="removeOccasionTag(' + occasionTagCounter + ')" style="margin-bottom: 10px;">删除此项</button>';
    html += '<select class="form-control" name="occasion_level1" style="margin-bottom: 10px;" onchange="handleOccasionLevel1Change(this, ' + occasionTagCounter + ')">';
    html += '<option value="">选择一级场合</option>';
    html += '</select>';
    html += '<select class="form-control" name="occasion_level2" style="margin-bottom: 10px;" disabled onchange="handleOccasionLevel2Change(this, ' + occasionTagCounter + ')">';
    html += '<option value="">选择二级场合</option>';
    html += '</select>';
    html += '<div class="level3-container"></div>';
    html += '</div>';
    
    newTag.innerHTML = html;
    container.appendChild(newTag);
    
    // 填充一级场合选项
    const level1Select = newTag.querySelector('select[name="occasion_level1"]');
    if (window.tagData.loaded && window.tagData.multi_level.occasion) {
        const occasionData = window.tagData.multi_level.occasion;
        if (occasionData.cascade && occasionData.cascade.level1) {
            occasionData.cascade.level1.forEach(tag => {
                const option = document.createElement('option');
                option.value = tag.value;
                option.textContent = tag.label;
                level1Select.appendChild(option);
            });
        }
    }
    
    occasionTagCounter++;
    saveToLocalStorage();
};

// 处理场合一级标签变化
window.handleOccasionLevel1Change = function(select, tagIndex) {
    const container = select.parentNode;
    const level2Select = container.querySelector('select[name="occasion_level2"]');
    const level3Container = container.querySelector('.level3-container');
    
    level2Select.innerHTML = '<option value="">选择二级场合</option>';
    if (level3Container) level3Container.innerHTML = '';
    level2Select.disabled = true;
    
    const selectedLevel1Id = select.value;
    if (!selectedLevel1Id) {
        return;
    }
    
    if (window.tagData.loaded && window.tagData.multi_level.occasion) {
        const occasionData = window.tagData.multi_level.occasion;
        if (occasionData.cascade && occasionData.cascade.level2_by_parent[selectedLevel1Id]) {
            level2Select.disabled = false;
            occasionData.cascade.level2_by_parent[selectedLevel1Id].forEach(tag => {
                const option = document.createElement('option');
                option.value = tag.value;
                option.textContent = tag.label;
                level2Select.appendChild(option);
            });
        }
    }
    
    saveToLocalStorage();
};

// 删除场合标签
window.removeOccasionTag = function(id) {
    const element = document.getElementById('occasionTag' + id);
    if (element) {
        element.remove();
        saveToLocalStorage();
        validateForm();
    }
};

// 收集风格标签IDs（包含所有父级）
function collectStyleTagIds() {
    const allTagIds = new Set();
    
    document.querySelectorAll('#styleTagsContainer .tag-selection').forEach(selection => {
        const level1Select = selection.querySelector('select[name="style_level1"]');
        const level2Select = selection.querySelector('select[name="style_level2"]');
        
        // 收集一级和二级选中的标签ID
        if (level1Select && level1Select.value) {
            allTagIds.add(parseInt(level1Select.value));
        }
        if (level2Select && level2Select.value) {
            allTagIds.add(parseInt(level2Select.value));
        }
        
        // 收集标签墙中选中的标签
        const selectedTags = selection.querySelectorAll('.tag-wall .tag-item.selected');
        selectedTags.forEach(tag => {
            const tagId = parseInt(tag.dataset.tagId);
            if (!isNaN(tagId)) {
                allTagIds.add(tagId);
            }
        });
    });
    
    return Array.from(allTagIds).filter(id => !isNaN(id));
}

// 收集场合标签IDs（包含所有父级）
function collectOccasionTagIds() {
    const allTagIds = new Set();
    
    document.querySelectorAll('#occasionTagsContainer .tag-selection').forEach(selection => {
        const level1Select = selection.querySelector('select[name="occasion_level1"]');
        const level2Select = selection.querySelector('select[name="occasion_level2"]');
        
        // 收集一级和二级选中的标签ID
        if (level1Select && level1Select.value) {
            allTagIds.add(parseInt(level1Select.value));
        }
        if (level2Select && level2Select.value) {
            allTagIds.add(parseInt(level2Select.value));
        }
        
        // 收集标签墙中选中的标签
        const selectedTags = selection.querySelectorAll('.tag-wall .tag-item.selected');
        selectedTags.forEach(tag => {
            const tagId = parseInt(tag.dataset.tagId);
            if (!isNaN(tagId)) {
                allTagIds.add(tagId);
            }
        });
    });
    
    return Array.from(allTagIds).filter(id => !isNaN(id));
}

// 收集模特属性标签ID（使用配置）
function collectModelAttributeTagIds() {
    const attributes = [];
    
    // 使用配置中的字段列表，如果配置未加载则使用默认值
    const fields = window.tagConfig.loaded && window.tagConfig.model_attributes 
        ? window.tagConfig.model_attributes 
        : ['model_age', 'model_gender', 'model_race', 'model_fit'];
    
    fields.forEach(field => {
        const selector = `select[name="${field}"]`;
        const element = document.querySelector(selector);
        if (element && element.value) {
            const value = parseInt(element.value);
            if (!isNaN(value)) {
                attributes.push(value);
            }
        }
    });
    
    return attributes;
}

// 收集构图标注信息（使用配置）
function collectCompositionAnnotation() {
    const annotation = {};
    
    // 使用配置中的字段列表，如果配置未加载则使用默认值
    const compositionFields = window.tagConfig.loaded && window.tagConfig.composition_fields
        ? window.tagConfig.composition_fields
        : ['composition_shot', 'composition_angle', 'composition_bodyratio', 'composition_position'];
    
    compositionFields.forEach(field => {
        const element = document.querySelector(`select[name="${field}"]`);
        if (element && element.value) {
            annotation[field] = parseInt(element.value) || element.value;
        }
    });
    
    return Object.keys(annotation).length > 0 ? annotation : null;
}

// ==================== 服装详情相关功能（改进版）====================
window.addOutfitDetail = function() {
    const container = document.getElementById('outfitDetailsContainer');
    const outfitId = 'outfit_' + outfitCounter;
    outfitCounter++;
    
    const outfitItem = document.createElement('div');
    outfitItem.className = 'outfit-item';
    outfitItem.id = outfitId;
    
    // 获取silhouette的两个一级节点选项
    let structureOptions = '';
    if (window.tagData.loaded && window.tagData.multi_level.silhouette) {
        const silhouetteData = window.tagData.multi_level.silhouette;
        if (silhouetteData.cascade && silhouetteData.cascade.level1) {
            const level1Tags = silhouetteData.cascade.level1;
            structureOptions = level1Tags.map(tag => 
                `<option value="${tag.value}">${tag.label}</option>`
            ).join('');
        }
    }
    
    outfitItem.innerHTML = `
        <button type="button" class="remove-button" onclick="removeOutfitDetail('${outfitId}')">删除</button>
        <h4>服装 ${outfitCounter - 1}</h4>
        
        <div class="form-group">
            <label>产品类型 <span class="required">*</span></label>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                <select class="form-control" name="product_type_level1" onchange="updateOutfitLevel2(this)">
                    <option value="">选择一级类别</option>
                </select>
                <select class="form-control" name="product_type_level2" disabled onchange="updateOutfitLevel3(this)">
                    <option value="">选择二级类别</option>
                </select>
                <select class="form-control" name="product_type_level3" disabled onchange="updateOutfitLevel4(this)>
                    <option value="">选择三级类别</option>
                </select>
                <select class="form-control" name="product_type_level4" disabled>
                    <option value="">选择四级类别</option>
                </select>
            </div>
        </div>
        
        <!-- 版型/廓形区域 - 分成两个独立的选择组 -->
        <div class="form-group silhouette-group">
            <label style="font-weight: bold; margin-bottom: 15px; display: block;">版型/廓形标注</label>
            <div class="note">一级标签不用更改，服装版型和廓形分别填一条最主要信息</div>
            <!-- 第一个选择组：自动选择第一个一级节点 -->
            <div class="silhouette-section" data-section="0" style="margin-bottom: 15px;">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                    <select class="form-control" name="silhouette_level1_0" data-index="0" onchange="updateSilhouetteLevel2(this, 0)">
                        ${structureOptions}
                    </select>
                    <select class="form-control" name="silhouette_level2_0" disabled onchange="updateSilhouetteLevel3(this, 0)">
                        <option value="">选择二级</option>
                    </select>
                    <select class="form-control" name="silhouette_level3_0" disabled>
                        <option value="">选择三级</option>
                    </select>
                </div>
            </div>
            
            <!-- 第二个选择组：自动选择第二个一级节点 -->
            <div class="silhouette-section" data-section="1" style="margin-bottom: 15px;">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                    <select class="form-control" name="silhouette_level1_1" data-index="1" onchange="updateSilhouetteLevel2(this, 1)">
                        ${structureOptions}
                    </select>
                    <select class="form-control" name="silhouette_level2_1" disabled onchange="updateSilhouetteLevel3(this, 1)">
                        <option value="">选择二级</option>
                    </select>
                    <select class="form-control" name="silhouette_level3_1" disabled>
                        <option value="">选择三级</option>
                    </select>
                </div>
            </div>
        </div>
        
        <div class="form-group">
            <label>材质</label>
            <select class="form-control" name="fabric_tag_ids">
                <option value="">选择材质</option>
            </select>
        </div>
        
        <div class="form-group">
            <label>颜色</label>
            <select class="form-control" name="color_tag_ids">
                <option value="">选择颜色</option>
            </select>
        </div>
    `;
    
    container.appendChild(outfitItem);
    initializeOutfitSelectors(outfitItem);
    
    // 自动选择两个不同的一级节点
    autoSelectSilhouetteLevel1(outfitItem);
};

// 自动为两个选择组选择不同的一级节点
function autoSelectSilhouetteLevel1(outfitItem) {
    if (!window.tagData.loaded || !window.tagData.multi_level.silhouette) return;
    
    const silhouetteData = window.tagData.multi_level.silhouette;
    if (!silhouetteData.cascade || !silhouetteData.cascade.level1) return;
    
    const level1Tags = silhouetteData.cascade.level1;
    if (level1Tags.length < 2) {
        console.warn('silhouette类型下的一级标签少于2个');
        return;
    }
    
    // 为第一个选择组选择第一个一级节点
    const select1 = outfitItem.querySelector('select[name="silhouette_level1_0"]');
    if (select1 && level1Tags[0]) {
        select1.value = level1Tags[0].value;
        // 触发change事件以加载二级选项
        updateSilhouetteLevel2(select1, 0);
    }
    
    // 为第二个选择组选择第二个一级节点
    const select2 = outfitItem.querySelector('select[name="silhouette_level1_1"]');
    if (select2 && level1Tags[1]) {
        select2.value = level1Tags[1].value;
        // 触发change事件以加载二级选项
        updateSilhouetteLevel2(select2, 1);
    }
}

// 更新廓形二级选项（支持索引参数）
window.updateSilhouetteLevel2 = function(select, index) {
    const container = select.closest('.outfit-item');
    if (!container) return;
    
    const level2Select = container.querySelector(`select[name="silhouette_level2_${index}"]`);
    const level3Select = container.querySelector(`select[name="silhouette_level3_${index}"]`);
    
    if (!level2Select || !level3Select) return;
    
    level2Select.innerHTML = '<option value="">选择二级</option>';
    level3Select.innerHTML = '<option value="">选择三级</option>';
    level3Select.disabled = true;
    
    const selectedLevel1Id = select.value;
    if (!selectedLevel1Id) {
        level2Select.disabled = true;
        return;
    }
    
    if (window.tagData.loaded && window.tagData.multi_level.silhouette) {
        const silhouetteData = window.tagData.multi_level.silhouette;
        if (silhouetteData.cascade && silhouetteData.cascade.level2_by_parent[selectedLevel1Id]) {
            level2Select.disabled = false;
            silhouetteData.cascade.level2_by_parent[selectedLevel1Id].forEach(tag => {
                const option = document.createElement('option');
                option.value = tag.value;
                option.textContent = tag.label;
                level2Select.appendChild(option);
            });
        }
    }
};

// 更新廓形三级选项（支持索引参数）
window.updateSilhouetteLevel3 = function(select, index) {
    const container = select.closest('.outfit-item');
    if (!container) return;
    
    const level3Select = container.querySelector(`select[name="silhouette_level3_${index}"]`);
    if (!level3Select) return;
    
    level3Select.innerHTML = '<option value="">选择三级</option>';
    
    const selectedLevel2Id = select.value;
    if (!selectedLevel2Id) {
        level3Select.disabled = true;
        return;
    }
    
    if (window.tagData.loaded && window.tagData.multi_level.silhouette) {
        const silhouetteData = window.tagData.multi_level.silhouette;
        if (silhouetteData.cascade && silhouetteData.cascade.level3_by_parent[selectedLevel2Id]) {
            level3Select.disabled = false;
            silhouetteData.cascade.level3_by_parent[selectedLevel2Id].forEach(tag => {
                const option = document.createElement('option');
                option.value = tag.value;
                option.textContent = tag.label;
                level3Select.appendChild(option);
            });
        }
    }
};

// 初始化服装选择器
function initializeOutfitSelectors(outfitItem) {
    // 初始化产品类型一级选择器
    const level1Select = outfitItem.querySelector('select[name="product_type_level1"]');
    if (level1Select && window.tagData.loaded && window.tagData.multi_level.product_type) {
        const productData = window.tagData.multi_level.product_type;
        if (productData.cascade && productData.cascade.level1) {
            productData.cascade.level1.forEach(tag => {
                const option = document.createElement('option');
                option.value = tag.value;
                option.textContent = tag.label;
                level1Select.appendChild(option);
            });
        }
    }
    
    // 初始化材质选择器
    const fabricSelect = outfitItem.querySelector('select[name="fabric_tag_ids"]');
    if (fabricSelect && window.tagData.loaded && window.tagData.single_level.fabric) {
        window.tagData.single_level.fabric.list.forEach(tag => {
            const option = document.createElement('option');
            option.value = tag.id;
            option.textContent = tag.name_cn || tag.name;
            fabricSelect.appendChild(option);
        });
    }
    
    // 初始化颜色选择器
    const colorSelect = outfitItem.querySelector('select[name="color_tag_ids"]');
    if (colorSelect && window.tagData.loaded && window.tagData.single_level.color) {
        window.tagData.single_level.color.list.forEach(tag => {
            const option = document.createElement('option');
            option.value = tag.id;
            option.textContent = tag.name_cn || tag.name;
            colorSelect.appendChild(option);
        });
    }
}

// 收集服装详情（改进版）
function collectOutfitDetails() {
    const outfitDetails = [];
    
    document.querySelectorAll('.outfit-item').forEach(item => {
        const outfit = {};
        
        // 收集产品类型标签（包括所有父级）
        const productTagIds = new Set();
        const productLevel1 = item.querySelector('select[name="product_type_level1"]');
        const productLevel2 = item.querySelector('select[name="product_type_level2"]');
        const productLevel3 = item.querySelector('select[name="product_type_level3"]');
        const productLevel4 = item.querySelector('select[name="product_type_level4"]');
        
        if (productLevel1 && productLevel1.value) {
            productTagIds.add(parseInt(productLevel1.value));
        }
        if (productLevel2 && productLevel2.value) {
            productTagIds.add(parseInt(productLevel2.value));
        }
        if (productLevel3 && productLevel3.value) {
            productTagIds.add(parseInt(productLevel3.value));
        }
        if (productLevel4 && productLevel4.value) {
            productTagIds.add(parseInt(productLevel4.value));
        }
        
        if (productTagIds.size > 0) {
            outfit.product_type_tag_ids = Array.from(productTagIds);
        }
        
        // 收集所有廓形/版型标签（合并两个选择组的所有选中项）
        const silhouetteTagIds = new Set();
        
        // 收集第一个选择组（服装结构）
        const structure1 = item.querySelector('select[name="silhouette_level1_0"]');
        const structure2 = item.querySelector('select[name="silhouette_level2_0"]');
        const structure3 = item.querySelector('select[name="silhouette_level3_0"]');
        
        if (structure1 && structure1.value) {
            silhouetteTagIds.add(parseInt(structure1.value));
        }
        if (structure2 && structure2.value) {
            silhouetteTagIds.add(parseInt(structure2.value));
        }
        if (structure3 && structure3.value) {
            silhouetteTagIds.add(parseInt(structure3.value));
        }
        
        // 收集第二个选择组（服装廓形）
        const silhouette1 = item.querySelector('select[name="silhouette_level1_1"]');
        const silhouette2 = item.querySelector('select[name="silhouette_level2_1"]');
        const silhouette3 = item.querySelector('select[name="silhouette_level3_1"]');
        
        if (silhouette1 && silhouette1.value) {
            silhouetteTagIds.add(parseInt(silhouette1.value));
        }
        if (silhouette2 && silhouette2.value) {
            silhouetteTagIds.add(parseInt(silhouette2.value));
        }
        if (silhouette3 && silhouette3.value) {
            silhouetteTagIds.add(parseInt(silhouette3.value));
        }
        
        // 将去重后的标签ID数组存入silhouette_tag_id字段
        if (silhouetteTagIds.size > 0) {
            outfit.silhouette_tag_id = Array.from(silhouetteTagIds);  // 数组形式
        }
        
        // 收集材质标签
        const fabricSelect = item.querySelector('select[name="fabric_tag_ids"]');
        if (fabricSelect && fabricSelect.value) {
            outfit.fabric_tag_id = parseInt(fabricSelect.value);
        }
        
        // 收集颜色标签
        const colorSelect = item.querySelector('select[name="color_tag_ids"]');
        if (colorSelect && colorSelect.value) {
            outfit.color_tag_id = parseInt(colorSelect.value);
        }
        
        // 只添加有实际选择的outfit项
        if (Object.keys(outfit).length > 0) {
            outfitDetails.push(outfit);
        }
    });
    
    return outfitDetails;
}

window.removeOutfitDetail = function(outfitId) {
    const item = document.getElementById(outfitId);
    if (item) {
        item.remove();
        saveToLocalStorage();
    }
};

// 收集表单数据（用于提交）
function collectFormData() {
    const formData = {
        // 基础信息
        reference_image_url: mainImage ? mainImage.s3_url : null,
        reference_type: parseInt(document.querySelector('input[name="reference_type"]:checked')?.value || '0'),
    };

    // 主题信息
    const themeValue = document.getElementById('theme').value;
    if (themeValue) {
        formData.theme_ids = [themeValue];
    }

    // 根据图片类型添加对应字段
    if (formData.reference_type === 1) {
        // 生成图字段
        formData.gen_content_prompt = document.getElementById('contentPrompt')?.value?.trim() || '';
        formData.gen_ml_model_source = document.getElementById('mlModel')?.value?.trim() || '';
        
        // 收集各类参考图和描述
        const referenceTypes = ['pose', 'outfit', 'scene', 'composition', 'style'];
        referenceTypes.forEach(type => {
            const images = referenceImages[type] || [];
            if (images.length > 0) {
                formData['gen_' + type + '_images'] = images.map(img => img.s3_url).filter(url => url);
                const descriptions = images.map(img => img.description || '').filter(desc => desc);
                if (descriptions.length > 0) {
                    formData['gen_' + type + '_description'] = descriptions.join('; ');
                }
            }
        });
        
    } else if (formData.reference_type === 2) {
        // 匹配图字段
        const productIds = document.getElementById('productIds')?.value?.trim();
        if (productIds) {
            formData.product_item_ids = productIds.split(',').map(id => id.trim()).filter(id => id);
        }
        
        const poseDesc = document.getElementById('poseDescription')?.value?.trim();
        if (poseDesc) {
            formData.pose_description = poseDesc;
        }
        
        const sceneDesc = document.getElementById('sceneDescription')?.value?.trim();
        if (sceneDesc) {
            formData.scene_description = sceneDesc;
        }
        
        const faceSwitch = document.querySelector('input[name="can_be_used_for_face_switching"]:checked');
        if (faceSwitch) {
            formData.can_be_used_for_face_switching = faceSwitch.value === 'true';
        }
    }

    // 收集风格标签ID（包含所有父级）
    formData.style_tag_ids = collectStyleTagIds();
    
    // 收集场合标签ID（包含所有父级）
    formData.occasion_tag_ids = collectOccasionTagIds();

    // 收集模特属性标签ID
    formData.model_attribute_tag_ids = collectModelAttributeTagIds();

    // 收集姿态标签ID
    const poseTagValue = document.getElementById('poseTag')?.value;
    if (poseTagValue) {
        formData.pose_tag_ids = [parseInt(poseTagValue)];
    }

    // 收集构图标注信息
    const compositionData = collectCompositionAnnotation();
    if (compositionData) {
        const compositionTagIds = [];
        Object.values(compositionData).forEach(value => {
            if (value && !isNaN(value)) {
                compositionTagIds.push(parseInt(value));
            }
        });
        formData.composition_tag_ids = compositionTagIds;
    }

    // 收集服装详情
    formData.outfit_details = collectOutfitDetails();

    return formData;
}

// 表单验证
function validateForm() {
    return true;
}

// 保存到本地存储
function saveToLocalStorage() {
    try {
        const formData = {
            mainImage: mainImage,
            referenceImages: referenceImages,
            tagData: window.tagData
        };
        localStorage.setItem('vibaFormData', JSON.stringify(formData));
    } catch (error) {
        console.error('保存到本地存储失败:', error);
    }
}

// Updated loadFromLocalStorage function
function loadFromLocalStorage() {
    try {
        const savedData = localStorage.getItem('vibaFormData');
        if (savedData) {
            const data = JSON.parse(savedData);
            if (data.mainImage) {
                mainImage = data.mainImage;
                displayMainImage();
            }
        }
        
        // Load UUID history
        loadUUIDHistory();
    } catch (error) {
        console.error('从本地存储加载失败:', error);
    }
}

// 显示加载状态
function showLoadingState() {
    const loadingState = document.getElementById('loadingState');
    const mainContent = document.getElementById('mainContent');
    if (loadingState) loadingState.style.display = 'block';
    if (mainContent) mainContent.style.display = 'none';
}

// 隐藏加载状态
function hideLoadingState() {
    const loadingState = document.getElementById('loadingState');
    const mainContent = document.getElementById('mainContent');
    if (loadingState) loadingState.style.display = 'none';
    if (mainContent) mainContent.style.display = 'block';
}

// ==================== 参考图上传相关功能 ====================
window.addReferenceImage = function(type) {
    const container = document.getElementById(type + 'ImagesContainer');
    if (!container) return;
    
    const itemId = type + '_' + referenceImageCounters[type];
    referenceImageCounters[type]++;
    
    const item = document.createElement('div');
    item.className = 'image-description-item';
    item.id = itemId;
    
    item.innerHTML = `
        <button type="button" class="remove-button" onclick="removeReferenceImage('${type}', '${itemId}')">删除</button>
        <div class="image-description-content">
            <div class="image-preview-container">
                <input type="file" accept="image/png,image/jpeg" style="display: none;" 
                       onchange="handleReferenceImageSelect(event, '${type}', '${itemId}')">
                <div class="upload-placeholder" onclick="this.previousElementSibling.click()">
                    点击上传
                </div>
            </div>
            <div class="description-input-container">
                <textarea class="form-control" placeholder="请输入${getTypeLabel(type)}描述" 
                          rows="3" onchange="updateReferenceDescription('${type}', '${itemId}', this.value)"></textarea>
            </div>
        </div>
    `;
    
    container.appendChild(item);
};

window.handleReferenceImageSelect = async function(event, type, itemId) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.match('image/(png|jpeg)')) {
        alert('请上传PNG或JPG格式的图片');
        return;
    }
    
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('image_type', 'prompt_' + type);
        
        const response = await fetch('/api/v1/annot-image/upload-image', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            const imageData = {
                id: itemId,
                file: file,
                url: URL.createObjectURL(file),
                s3_url: result.data.url,
                description: ''
            };
            
            if (!referenceImages[type]) {
                referenceImages[type] = [];
            }
            
            const existingIndex = referenceImages[type].findIndex(img => img.id === itemId);
            if (existingIndex >= 0) {
                referenceImages[type][existingIndex] = imageData;
            } else {
                referenceImages[type].push(imageData);
            }
            
            updateReferenceImageDisplay(type, itemId, imageData);
            saveToLocalStorage();
        } else {
            throw new Error(result.error || '上传失败');
        }
    } catch (error) {
        console.error('上传失败:', error);
        alert('上传失败: ' + error.message);
    }
}

// UUID Management Functions

// Display submitted UUID
function displaySubmittedUUID(uuid) {
    const historySection = document.getElementById('submissionHistory');
    const uuidList = document.getElementById('uuidList');
    
    // Show the section
    historySection.style.display = 'block';
    
    // Create UUID item
    const uuidItem = document.createElement('div');
    uuidItem.className = 'uuid-item';
    
    const timestamp = new Date().toLocaleString('zh-CN');
    
    uuidItem.innerHTML = `
        <div>
            <div class="uuid-text">${uuid}</div>
            <div class="uuid-timestamp">提交时间: ${timestamp}</div>
        </div>
        <button class="copy-button" onclick="copyUUID('${uuid}', this)">复制</button>
    `;
    
    // Insert at the beginning
    uuidList.insertBefore(uuidItem, uuidList.firstChild);
    
    // Keep only the last 5 submissions
    while (uuidList.children.length > 5) {
        uuidList.removeChild(uuidList.lastChild);
    }
    
    // Save to localStorage
    saveUUIDToHistory(uuid, timestamp);
}

// Copy UUID to clipboard
window.copyUUID = async function(uuid, button) {
    try {
        await navigator.clipboard.writeText(uuid);
        const originalText = button.textContent;
        button.textContent = '已复制';
        button.classList.add('copied');
        
        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
        }, 2000);
    } catch (err) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = uuid;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        button.textContent = '已复制';
        setTimeout(() => {
            button.textContent = '复制';
        }, 2000);
    }
};

// Clear submission history
window.clearSubmissionHistory = function() {
    if (confirm('确定要清空提交历史吗？')) {
        document.getElementById('uuidList').innerHTML = '';
        document.getElementById('submissionHistory').style.display = 'none';
        localStorage.removeItem('vibaUUIDHistory');
    }
};

// Save UUID to localStorage
function saveUUIDToHistory(uuid, timestamp) {
    try {
        let history = JSON.parse(localStorage.getItem('vibaUUIDHistory') || '[]');
        history.unshift({ uuid, timestamp });
        history = history.slice(0, 5); // Keep only last 5
        localStorage.setItem('vibaUUIDHistory', JSON.stringify(history));
    } catch (error) {
        console.error('Failed to save UUID to history:', error);
    }
}

// Load UUID history from localStorage
function loadUUIDHistory() {
    try {
        const history = JSON.parse(localStorage.getItem('vibaUUIDHistory') || '[]');
        if (history.length > 0) {
            const historySection = document.getElementById('submissionHistory');
            const uuidList = document.getElementById('uuidList');
            
            historySection.style.display = 'block';
            
            history.forEach(item => {
                const uuidItem = document.createElement('div');
                uuidItem.className = 'uuid-item';
                
                uuidItem.innerHTML = `
                    <div>
                        <div class="uuid-text">${item.uuid}</div>
                        <div class="uuid-timestamp">提交时间: ${item.timestamp}</div>
                    </div>
                    <button class="copy-button" onclick="copyUUID('${item.uuid}', this)">复制</button>
                `;
                
                uuidList.appendChild(uuidItem);
            });
        }
    } catch (error) {
        console.error('Failed to load UUID history:', error);
    }
}