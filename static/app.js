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

// 页面加载完成时执行
document.addEventListener('DOMContentLoaded', async function() {
    console.log('页面加载开始');
    showLoadingState();
    
    // 并行加载主题和标签数据
    const [themesLoaded, tagsLoaded] = await Promise.all([
        loadThemesFromAPI(),
        loadTagsFromAPI()
    ]);
    
    // 初始化事件监听器
    initializeEventListeners();
    loadFromLocalStorage();
    validateForm();
    hideLoadingState();
    
    console.log('主题加载状态:', themesLoaded);
    console.log('标签加载状态:', tagsLoaded);
});

// 加载主题数据
async function loadThemesFromAPI() {
    try {
        const response = await fetch('/api/themes');
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
        const response = await fetch('/api/tags/all');
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
    const styleLevel1Select = document.querySelector('#styleTag0 select[name="style_level1"]');
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
    const occasionLevel1Select = document.querySelector('#occasionTag0 select[name="occasion_level1"]');
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
        { name: 'model_size', selector: 'select[name="model_size"]', label: '体型' }
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
    // 这里可以添加 fallback 逻辑
}

// 处理表单提交
async function handleSubmit(e) {
    e.preventDefault();
    
    // 基础验证
    if (!mainImage) {
        alert('请先上传主图');
        return;
    }
    
    const referenceType = document.querySelector('input[name="reference_type"]:checked');
    if (!referenceType) {
        alert('请选择图片类型');
        return;
    }
    
    try {
        const submitButton = document.getElementById('submitButton');
        submitButton.disabled = true;
        submitButton.textContent = '提交中...';
        
        const formData = collectFormData();
        console.log('提交的数据:', formData);
        
        const response = await fetch('/api/reference-images', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('标注提交成功！');
            // 可选：清空表单
            if (confirm('是否清空表单以便继续标注？')) {
                resetForm();
            }
        } else {
            throw new Error(result.error || '提交失败');
        }
    } catch (error) {
        console.error('提交失败:', error);
        alert('提交失败: ' + error.message);
    } finally {
        const submitButton = document.getElementById('submitButton');
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = '提交标注';
        }
    }
}

// 重置表单
function resetForm() {
    // 清除主图
    if (window.deleteMainImage) {
        window.deleteMainImage();
    }
    
    // 重置表单
    document.getElementById('annotationForm').reset();
    
    // 清除本地存储
    localStorage.removeItem('vibaFormData');
    
    // 重新加载页面或重新初始化
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
        updateStyleTagWall(target);
    } else if (target.name === 'occasion_level1') {
        updateOccasionLevel2(target);
    } else if (target.name === 'occasion_level2') {
        updateOccasionTagWall(target);
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
async function handleMainImageFile(file) {
    if (!file.type.match('image/(png|jpeg)')) {
        alert('请上传PNG或JPG格式的图片');
        return;
    }

    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('image_type', 'reference_image');

        const response = await fetch('/api/upload-image', {
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
                image_info: result.data.image_info
            };

            displayMainImage();
            saveToLocalStorage();
            validateForm();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('主图上传失败:', error);
        alert('主图上传失败: ' + error.message);
    }
}

// 显示主图
function displayMainImage() {
    const preview = document.getElementById('mainImagePreview');
    if (preview && mainImage) {
        preview.innerHTML = '<div style="position: relative; display: inline-block;">' +
            '<img src="' + mainImage.url + '" class="main-image-preview" alt="主图预览">' +
            '<button class="delete-image-btn" onclick="deleteMainImage()" style="display: flex;">×</button>' +
            '</div>';
    }
}

// 删除主图
window.deleteMainImage = function() {
    mainImage = null;
    const preview = document.getElementById('mainImagePreview');
    if (preview) preview.innerHTML = '';
    const input = document.getElementById('mainImageInput');
    if (input) input.value = '';
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
    const tagWall = container.querySelector('.tag-wall');
    
    if (!level2Select) return;
    
    level2Select.innerHTML = '<option value="">选择二级风格</option>';
    if (tagWall) tagWall.innerHTML = '';
    
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

// 更新风格标签墙
function updateStyleTagWall(select) {
    const container = select.parentNode;
    const tagWall = container.querySelector('.tag-wall');
    
    if (!tagWall) return;
    tagWall.innerHTML = '';
    
    const selectedLevel2Id = select.value;
    if (!selectedLevel2Id) return;
    
    if (window.tagData.loaded && window.tagData.multi_level.style) {
        const styleData = window.tagData.multi_level.style;
        if (styleData.cascade && styleData.cascade.level3_by_parent[selectedLevel2Id]) {
            styleData.cascade.level3_by_parent[selectedLevel2Id].forEach(tag => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'tag-item';
                button.textContent = tag.label;
                button.dataset.tagId = tag.value;
                button.onclick = () => toggleTag(button);
                tagWall.appendChild(button);
            });
        }
    }
}

// 更新场合二级标签
function updateOccasionLevel2(select) {
    const container = select.parentNode;
    const level2Select = container.querySelector('select[name="occasion_level2"]');
    const tagWall = container.querySelector('.tag-wall');
    
    if (!level2Select) return;
    
    level2Select.innerHTML = '<option value="">选择二级场合</option>';
    if (tagWall) tagWall.innerHTML = '';
    
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

// 更新场合标签墙
function updateOccasionTagWall(select) {
    const container = select.parentNode;
    const tagWall = container.querySelector('.tag-wall');
    
    if (!tagWall) return;
    tagWall.innerHTML = '';
    
    const selectedLevel2Id = select.value;
    if (!selectedLevel2Id) return;
    
    if (window.tagData.loaded && window.tagData.multi_level.occasion) {
        const occasionData = window.tagData.multi_level.occasion;
        if (occasionData.cascade && occasionData.cascade.level3_by_parent[selectedLevel2Id]) {
            occasionData.cascade.level3_by_parent[selectedLevel2Id].forEach(tag => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'tag-item';
                button.textContent = tag.label;
                button.dataset.tagId = tag.value;
                button.onclick = () => toggleTag(button);
                tagWall.appendChild(button);
            });
        }
    }
}

// 更新服装二级类别
function updateOutfitLevel2(select) {
    const container = select.closest('.outfit-item');
    if (!container) return;
    
    const level2Select = container.querySelector('select[name="product_type_level2"]');
    const level3Select = container.querySelector('select[name="product_type_level3"]');
    
    if (!level2Select || !level3Select) return;
    
    level2Select.innerHTML = '<option value="">选择二级类别</option>';
    level3Select.innerHTML = '<option value="">选择三级类别</option>';
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
    if (!level3Select) return;
    
    level3Select.innerHTML = '<option value="">选择三级类别</option>';
    
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
    html += '<select class="form-control" name="style_level3" style="margin-bottom: 10px;" disabled>';
    html += '<option value="">选择三级风格</option>';
    html += '</select>';
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
                option.dataset.tagId = tag.value;
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
    const level3Select = container.querySelector('select[name="style_level3"]');
    
    // 重置下级选择
    level2Select.innerHTML = '<option value="">选择二级风格</option>';
    level3Select.innerHTML = '<option value="">选择三级风格</option>';
    level3Select.disabled = true;
    
    const selectedLevel1Id = select.value;
    if (!selectedLevel1Id) {
        level2Select.disabled = true;
        return;
    }
    
    // 填充二级选项
    if (window.tagData.loaded && window.tagData.multi_level.style) {
        const styleData = window.tagData.multi_level.style;
        if (styleData.cascade && styleData.cascade.level2_by_parent[selectedLevel1Id]) {
            level2Select.disabled = false;
            styleData.cascade.level2_by_parent[selectedLevel1Id].forEach(tag => {
                const option = document.createElement('option');
                option.value = tag.value;
                option.textContent = tag.label;
                option.dataset.tagId = tag.value;
                level2Select.appendChild(option);
            });
        }
    }
    
    saveToLocalStorage();
};

// 处理风格二级标签变化
window.handleStyleLevel2Change = function(select, tagIndex) {
    const container = select.parentNode;
    const level3Select = container.querySelector('select[name="style_level3"]');
    
    // 重置三级选择
    level3Select.innerHTML = '<option value="">选择三级风格</option>';
    
    const selectedLevel2Id = select.value;
    if (!selectedLevel2Id) {
        level3Select.disabled = true;
        return;
    }
    
    // 填充三级选项
    if (window.tagData.loaded && window.tagData.multi_level.style) {
        const styleData = window.tagData.multi_level.style;
        if (styleData.cascade && styleData.cascade.level3_by_parent[selectedLevel2Id]) {
            level3Select.disabled = false;
            styleData.cascade.level3_by_parent[selectedLevel2Id].forEach(tag => {
                const option = document.createElement('option');
                option.value = tag.value;
                option.textContent = tag.label;
                option.dataset.tagId = tag.value;
                level3Select.appendChild(option);
            });
        } else {
            // 如果没有三级标签，禁用三级选择器
            level3Select.disabled = true;
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
    html += '<select class="form-control" name="occasion_level3" style="margin-bottom: 10px;" disabled>';
    html += '<option value="">选择三级场合</option>';
    html += '</select>';
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
                option.dataset.tagId = tag.value;
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
    const level3Select = container.querySelector('select[name="occasion_level3"]');
    
    // 重置下级选择
    level2Select.innerHTML = '<option value="">选择二级场合</option>';
    level3Select.innerHTML = '<option value="">选择三级场合</option>';
    level3Select.disabled = true;
    
    const selectedLevel1Id = select.value;
    if (!selectedLevel1Id) {
        level2Select.disabled = true;
        return;
    }
    
    // 填充二级选项
    if (window.tagData.loaded && window.tagData.multi_level.occasion) {
        const occasionData = window.tagData.multi_level.occasion;
        if (occasionData.cascade && occasionData.cascade.level2_by_parent[selectedLevel1Id]) {
            level2Select.disabled = false;
            occasionData.cascade.level2_by_parent[selectedLevel1Id].forEach(tag => {
                const option = document.createElement('option');
                option.value = tag.value;
                option.textContent = tag.label;
                option.dataset.tagId = tag.value;
                level2Select.appendChild(option);
            });
        }
    }
    
    saveToLocalStorage();
};

// 处理场合二级标签变化
window.handleOccasionLevel2Change = function(select, tagIndex) {
    const container = select.parentNode;
    const level3Select = container.querySelector('select[name="occasion_level3"]');
    
    // 重置三级选择
    level3Select.innerHTML = '<option value="">选择三级场合</option>';
    
    const selectedLevel2Id = select.value;
    if (!selectedLevel2Id) {
        level3Select.disabled = true;
        return;
    }
    
    // 填充三级选项
    if (window.tagData.loaded && window.tagData.multi_level.occasion) {
        const occasionData = window.tagData.multi_level.occasion;
        if (occasionData.cascade && occasionData.cascade.level3_by_parent[selectedLevel2Id]) {
            level3Select.disabled = false;
            occasionData.cascade.level3_by_parent[selectedLevel2Id].forEach(tag => {
                const option = document.createElement('option');
                option.value = tag.value;
                option.textContent = tag.label;
                option.dataset.tagId = tag.value;
                level3Select.appendChild(option);
            });
        } else {
            // 如果没有三级标签，禁用三级选择器
            level3Select.disabled = true;
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
        const level3Select = selection.querySelector('select[name="style_level3"]');
        
        // 收集选中的标签ID
        if (level1Select && level1Select.value) {
            allTagIds.add(parseInt(level1Select.value));
        }
        if (level2Select && level2Select.value) {
            allTagIds.add(parseInt(level2Select.value));
        }
        if (level3Select && level3Select.value) {
            allTagIds.add(parseInt(level3Select.value));
        }
    });
    
    return Array.from(allTagIds).filter(id => !isNaN(id));
}

// 收集场合标签IDs（包含所有父级）
function collectOccasionTagIds() {
    const allTagIds = new Set();
    
    document.querySelectorAll('#occasionTagsContainer .tag-selection').forEach(selection => {
        const level1Select = selection.querySelector('select[name="occasion_level1"]');
        const level2Select = selection.querySelector('select[name="occasion_level2"]');
        const level3Select = selection.querySelector('select[name="occasion_level3"]');
        
        // 收集选中的标签ID
        if (level1Select && level1Select.value) {
            allTagIds.add(parseInt(level1Select.value));
        }
        if (level2Select && level2Select.value) {
            allTagIds.add(parseInt(level2Select.value));
        }
        if (level3Select && level3Select.value) {
            allTagIds.add(parseInt(level3Select.value));
        }
    });
    
    return Array.from(allTagIds).filter(id => !isNaN(id));
}

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
        // 将构图标签ID收集到相应的数组中
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

// 收集模特属性标签ID
function collectModelAttributeTagIds() {
    const attributes = [];
    const attributeSelectors = [
        'select[name="model_age"]',
        'select[name="model_gender"]', 
        'select[name="model_race"]',
        'select[name="model_size"]'
    ];
    
    attributeSelectors.forEach(selector => {
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

// 收集构图标注信息
function collectCompositionAnnotation() {
    const annotation = {};
    const compositionFields = [
        'composition_shot',
        'composition_angle', 
        'composition_bodyratio',
        'composition_position'
    ];
    
    compositionFields.forEach(field => {
        const element = document.querySelector('select[name="' + field + '"]');
        if (element && element.value) {
            annotation[field] = parseInt(element.value) || element.value;
        }
    });
    
    return Object.keys(annotation).length > 0 ? annotation : null;
}

// 收集服装详情
function collectOutfitDetails() {
    const outfitDetails = [];
    
    document.querySelectorAll('.outfit-item').forEach(item => {
        const outfit = {};
        const tagIds = new Set();
        
        // 收集产品类型标签（包括所有父级）
        const level1Select = item.querySelector('select[name="product_type_level1"]');
        const level2Select = item.querySelector('select[name="product_type_level2"]');
        const level3Select = item.querySelector('select[name="product_type_level3"]');
        
        if (level1Select && level1Select.value) {
            tagIds.add(parseInt(level1Select.value));
        }
        if (level2Select && level2Select.value) {
            tagIds.add(parseInt(level2Select.value));
        }
        if (level3Select && level3Select.value) {
            tagIds.add(parseInt(level3Select.value));
        }
        
        if (tagIds.size > 0) {
            outfit.product_type_tag_ids = Array.from(tagIds);
        }
        
        // 收集其他标签
        const fabricSelect = item.querySelector('select[name="fabric_tag_ids"]');
        if (fabricSelect && fabricSelect.value) {
            outfit.fabric_tag_id = parseInt(fabricSelect.value);
        }
        
        const silhouetteSelect = item.querySelector('select[name="silhouette_tag_ids"]');
        if (silhouetteSelect && silhouetteSelect.value) {
            outfit.silhouette_tag_id = parseInt(silhouetteSelect.value);
        }
        
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

// 表单验证
function validateForm() {
    // 基础验证逻辑
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

// 从本地存储加载
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
// 添加参考图上传功能
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
                <div class="upload-placeholder" onclick="this.previousElementSibling.click()" 
                     style="cursor: pointer; color: #999;">
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

// 处理参考图选择
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
        
        const response = await fetch('/api/upload-image', {
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
            
            // 更新引用图数组
            if (!referenceImages[type]) {
                referenceImages[type] = [];
            }
            
            // 查找是否已存在
            const existingIndex = referenceImages[type].findIndex(img => img.id === itemId);
            if (existingIndex >= 0) {
                referenceImages[type][existingIndex] = imageData;
            } else {
                referenceImages[type].push(imageData);
            }
            
            // 更新显示
            updateReferenceImageDisplay(type, itemId, imageData);
            saveToLocalStorage();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('参考图上传失败:', error);
        alert('参考图上传失败: ' + error.message);
    }
};

// 更新参考图显示
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

// 删除参考图
window.deleteReferenceImage = function(type, itemId) {
    const index = referenceImages[type].findIndex(img => img.id === itemId);
    if (index >= 0) {
        // 释放URL
        if (referenceImages[type][index].url) {
            URL.revokeObjectURL(referenceImages[type][index].url);
        }
        referenceImages[type].splice(index, 1);
    }
    
    // 清空显示但保留输入框
    const item = document.getElementById(itemId);
    if (item) {
        const previewContainer = item.querySelector('.image-preview-container');
        if (previewContainer) {
            previewContainer.innerHTML = `
                <input type="file" accept="image/png,image/jpeg" style="display: none;" 
                       onchange="handleReferenceImageSelect(event, '${type}', '${itemId}')">
                <div class="upload-placeholder" onclick="this.previousElementSibling.click()" 
                     style="cursor: pointer; color: #999;">
                    点击上传
                </div>
            `;
        }
    }
    
    saveToLocalStorage();
};

// 移除参考图项
window.removeReferenceImage = function(type, itemId) {
    // 先删除图片数据
    const index = referenceImages[type].findIndex(img => img.id === itemId);
    if (index >= 0) {
        if (referenceImages[type][index].url) {
            URL.revokeObjectURL(referenceImages[type][index].url);
        }
        referenceImages[type].splice(index, 1);
    }
    
    // 移除DOM元素
    const item = document.getElementById(itemId);
    if (item) {
        item.remove();
    }
    
    saveToLocalStorage();
};

// 更新参考图描述
window.updateReferenceDescription = function(type, itemId, description) {
    const image = referenceImages[type].find(img => img.id === itemId);
    if (image) {
        image.description = description;
        saveToLocalStorage();
    }
};

// 获取类型标签
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

// ==================== 服装详情相关功能 ====================
// 添加服装详情功能
window.addOutfitDetail = function() {
    const container = document.getElementById('outfitDetailsContainer');
    const outfitId = 'outfit_' + outfitCounter;
    outfitCounter++;
    
    const outfitItem = document.createElement('div');
    outfitItem.className = 'outfit-item';
    outfitItem.id = outfitId;
    
    outfitItem.innerHTML = `
        <button type="button" class="remove-button" onclick="removeOutfitDetail('${outfitId}')">删除</button>
        <h4>服装 ${outfitCounter}</h4>
        
        <div class="form-group">
            <label>产品类型 <span class="required">*</span></label>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                <select class="form-control" name="product_type_level1" onchange="updateOutfitLevel2(this)">
                    <option value="">选择一级类别</option>
                </select>
                <select class="form-control" name="product_type_level2" disabled onchange="updateOutfitLevel3(this)">
                    <option value="">选择二级类别</option>
                </select>
                <select class="form-control" name="product_type_level3" disabled>
                    <option value="">选择三级类别</option>
                </select>
            </div>
        </div>
        
        <div class="form-group">
            <label>材质</label>
            <select class="form-control" name="fabric_tag_ids">
                <option value="">选择材质</option>
            </select>
        </div>
        
        <div class="form-group">
            <label>版型</label>
            <select class="form-control" name="silhouette_tag_ids">
                <option value="">选择版型</option>
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
    
    // 初始化选择器
    initializeOutfitSelectors(outfitItem);
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
    
    // 初始化版型选择器
    const silhouetteSelect = outfitItem.querySelector('select[name="silhouette_tag_ids"]');
    if (silhouetteSelect && window.tagData.loaded && window.tagData.multi_level.silhouette) {
        // 获取所有叶子节点
        const silhouetteData = window.tagData.multi_level.silhouette;
        if (silhouetteData.flat) {
            Object.values(silhouetteData.flat).forEach(tag => {
                if (tag.is_leaf) {
                    const option = document.createElement('option');
                    option.value = tag.id;
                    option.textContent = tag.name_cn || tag.name;
                    silhouetteSelect.appendChild(option);
                }
            });
        }
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

// 删除服装详情
window.removeOutfitDetail = function(outfitId) {
    const item = document.getElementById(outfitId);
    if (item) {
        item.remove();
        saveToLocalStorage();
    }
};