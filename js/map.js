const map = new maplibregl.Map({
    container: 'map',
    style: MAP_CONFIG.style,
    center: MAP_CONFIG.center,
    zoom: MAP_CONFIG.zoom
});

let currentLevel = 'republic';
let activeMetric = null;
let activeTradeMode = 'retail';
let chartInstance = null;
let manufacturersRegistry = {};

// Хелпер для экранирования HTML (защита от XSS)
function escapeHtml(text) {
    if (!text) return text;
    return text.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// --- ИНИЦИАЛИЗАЦИЯ ---

document.addEventListener('DOMContentLoaded', () => {
    createLevelButtons();
    initChart();
    initMaterialDropdown();
});

map.on('load', async () => {
    loadIcons(); // Загрузка иконок town.png и т.д.

    // Добавляем источник для подсветки границ
    map.addSource('highlight-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
        id: 'highlight-line', type: 'line', source: 'highlight-source',
        paint: { 'line-color': '#f1c40f', 'line-width': 3 }
    });

    // Загружаем слои из конфига
    Object.entries(MAP_CONFIG.layersData).forEach(([key, conf]) => {
        if (!map.getSource(key)) {
            map.addSource(key, { type: 'geojson', data: conf.file });
        }
        addLayerVisuals(key, conf);
        setupInteraction(key, conf);
    });

    switchLevel('republic');
    
    // Сброс подсветки при клике в пустоту
map.on('click', (e) => {
    const features = map.queryRenderedFeatures(e.point);

// 1. Ищем клик по населенному пункту
    const townFeature = features.find(f => f.layer.id === 'towns');

    // Проверяем, активна ли категория производителей в интерфейсе
    const isProducersActive = document.getElementById('chk-toggle_manufacturers')?.checked;

    if (townFeature && isProducersActive) {
        const cityName = townFeature.properties.name; // Поле name из towns.geojson
        const producers = manufacturersRegistry[cityName];

        if (producers && producers.length > 0) {
            // Формируем HTML список производителей
            const producersHtml = producers.map(p => `
                <div style="border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 8px;">
                    <div style="font-weight: bold; color: #007aff;">${p['Наименование производителей']}</div>
                    <div style="font-size: 12px; margin-top: 4px;">
                        <b>Продукция:</b> ${p['Классификация']}<br>
                        <b>Мощность:</b> ${p['Производственная мощность в год']}<br>
                        <b>Контакты:</b> ${p['Контакты']}
                    </div>
                </div>
            `).join('');

            new maplibregl.Popup()
                .setLngLat(e.lngLat)
                .setHTML(`
                    <div class="popup-header">
                        <span class="popup-title-main">${cityName}</span>
                        <span class="popup-subtitle">Найдено производителей: ${producers.length}</span>
                    </div>
                    <div class="popup-body" style="max-height: 250px; overflow-y: auto;">
                        ${producersHtml}
                    </div>
                `)
                .addTo(map);
            return; // Прерываем, чтобы не срабатывали другие попапы
        }
    }

    // --- ИСПРАВЛЕНИЕ: СБРОС ВЫДЕЛЕНИЯ ---
    if (features.length === 0) {
        // Очищаем линию выделения
        const source = map.getSource('highlight-source');
        if (source) {
            source.setData({ type: 'FeatureCollection', features: [] });
        }
        // Скрываем попап (если есть открытый)
        const activePopups = document.getElementsByClassName('maplibregl-popup');
        while (activePopups[0]) activePopups[0].remove();
        
        return; // Выходим из функции
    }
    
    // Ищем фичу из слоя balance
    const balanceFeature = features.find(f => f.layer.id === 'balance');

    if (balanceFeature) {
        // Берем готовый HTML из свойства combined_info
        const htmlContent = balanceFeature.properties.combined_info || 'Нет данных';
        const regionName = balanceFeature.properties.ADM1_EN || balanceFeature.properties.Name || 'Регион';

        new maplibregl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(`
                <div class="popup-header"><span class="popup-title-main">${regionName}</span></div>
                <div class="popup-body" style="max-height: 200px; overflow-y: auto;">
                    ${htmlContent}
                </div>
            `)
            .addTo(map);
        
        return; // Прерываем функцию, чтобы не сработали другие клики (например, по районам)
    }
    });
    await loadManufacturersData();
    createAccordion();
});

// --- ВИЗУАЛИЗАЦИЯ СЛОЕВ ---

function addLayerVisuals(key, conf) {
    if (conf.type === 'fill') {
        map.addLayer({
            id: key, type: 'fill', source: key, layout: { visibility: 'none' },
            paint: { 
                'fill-color': conf.baseColor || '#ccc', 
                'fill-opacity': conf.opacity || 0.6,
                'fill-outline-color': conf.borderColor || '#fff'
            }
        }, 'highlight-line'); // Слой подсветки должен быть выше заливки
    } else if (conf.type === 'line') {
        map.addLayer({
            id: key, type: 'line', source: key, layout: { visibility: 'none' },
            paint: { 
                'line-color': conf.color, 
                'line-width': conf.width,
                'line-dasharray': conf.dashArray || [1, 0]
            }
        });
    } else if (conf.type === 'point-icon') {
        map.addLayer({
            id: 'towns',
            type: 'circle',
            source: 'towns',
            layout: {
                'visibility': 'none' // <--- ДОБАВИТЬ ЭТУ СТРОКУ
            },
            paint: {
                'circle-radius': 6,
                'circle-color': '#1a2025',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff'
            }
        });
        // map.addLayer({
        //     id: key, type: 'symbol', source: key,
        //     layout: { 'visibility': 'none', 'icon-image': conf.icon, 'icon-size': 0.5, 'icon-allow-overlap': true }
        // });
    }
}

// --- УПРАВЛЕНИЕ ДАННЫМИ (Временные ряды) ---

// Функция извлекает данные из свойств GeoJSON по префиксу (например, ищет всё, что начинается на "vrp_")
function extractTimeSeries(properties, prefix) {
    // Регулярка ищет ключи вида "prefix_2023"
    const regex = new RegExp(`^${prefix}_(\\d{4})$`);
    const data = [];
    
    for (const key in properties) {
        const match = key.match(regex);
        if (match && properties[key] !== null && properties[key] !== undefined) {
            data.push({
                year: parseInt(match[1]), // Год из названия поля
                value: parseFloat(properties[key])
            });
        }
    }
    // Сортируем по годам (от старых к новым)
    return data.sort((a, b) => a.year - b.year);
}

// --- ГРАФИКИ ---

function initChart() {
    const ctx = document.getElementById('popChart');
    if (!ctx) return;
    
    chartInstance = new Chart(ctx.getContext('2d'), {
        type: 'line', // Тип по умолчанию
        data: { labels: [], datasets: [] },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            interaction: { mode: 'index', intersect: false },
            plugins: { 
                legend: { display: true, position: 'bottom',
                labels: {
                boxWidth: 10,
                font: {
                size: 10
                }}},
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            let val = context.parsed.y;
                            if (context.datasetIndex === 1) { // Это наш слой разницы
                                if (val > 0) return `Преобладают мужчины на: ${val.toLocaleString()} чел.`;
                                if (val < 0) return `Преобладают женщины на: ${Math.abs(val).toLocaleString()} чел.`;
                                return `Баланс М/Ж соблюден`;
                            }
                            return `${label}: ${val.toLocaleString()} чел.`;
                        }
                    }
                }
            },
            scales: {
        y: { ticks: { font: { size: 10 } } },
        x: { ticks: { font: { size: 10 } } }
            }
        }
    });
}

function updateChart(p, layerId) {
    if (!chartInstance || !p) return;
    
    let chartProps = p;
    let regionName = p['ADM1_EN'] || p['ADM_2_rus'] || p['name'] || 'Регион';

    // Логика подмены данных для районов (берем данные области)
    if (layerId === 'districts') {
        const parentId = p['ADM1_EN'];
        if (parentId && oblastDataCache[parentId]) {
            chartProps = oblastDataCache[parentId];
            regionName = chartProps['ADM1_EN'] || chartProps['ADM_2_rus'];
        }
    }

    let datasets = [];
    let labels = [];

    // 1. СЦЕНАРИЙ: НАСЕЛЕНИЕ (Линия + Проценты по полу)
    // Срабатывает, если метрика не выбрана ИЛИ выбрана Population
// 1. СЦЕНАРИЙ: НАСЕЛЕНИЕ (Линия тренда + Слой разницы М/Ж)
    if (!activeMetric || activeMetric.id === 'population') {
        const totalSeries = extractTimeSeries(chartProps, 'popul_total');
        const maleSeries = extractTimeSeries(chartProps, 'popul_male');
        const femaleSeries = extractTimeSeries(chartProps, 'popul_female');

        labels = [...new Set([...totalSeries, ...maleSeries, ...femaleSeries].map(d => d.year))].sort();

        const totalArr = [];
        const diffArr = [];
        const barColors = [];

        labels.forEach(year => {
            const tItem = totalSeries.find(d => d.year === year);
            const mItem = maleSeries.find(d => d.year === year);
            const fItem = femaleSeries.find(d => d.year === year);

            totalArr.push(tItem ? tItem.value : null);

            const mVal = mItem ? mItem.value : 0;
            const fVal = fItem ? fItem.value : 0;
            const diff = mVal - fVal; // Разница
            diffArr.push(diff);
            
            // Если больше мужчин — синий, если женщин — красный
            barColors.push(diff > 0 ? 'rgba(52, 152, 219, 0.7)' : 'rgba(231, 76, 60, 0.7)');
        });

        datasets = [
            {
                type: 'line',
                label: 'Всего население (чел.)',
                data: totalArr,
                borderColor: '#2c3e50',
                borderWidth: 2,
                pointRadius: 2,
                yAxisID: 'y', // Левая ось
                order: 1
            },
            {
                type: 'bar',
                label: 'Разница (М выше 0 / Ж ниже 0)',
                data: diffArr,
                backgroundColor: barColors,
                yAxisID: 'y1', // Правая ось
                order: 2
            }
        ];

        // Настройка двойной оси: слева - миллионы людей, справа - разница в тысячах
        chartInstance.options.scales = {
            y: { 
                type: 'linear', display: true, position: 'left',
                title: { display: true, text: 'Всего (чел)', font: { size: 10 } }
            },
            y1: { 
                type: 'linear', display: true, position: 'right',
                title: { display: true, text: 'Разница М/Ж (чел)', font: { size: 10 } },
                grid: { drawOnChartArea: false } // Убираем наложение сетки
            }
        };

    // 2. СЦЕНАРИЙ: РАСХОДЫ (Город vs Село)
    } else if (activeMetric?.id === 'expenses_total') {
        const urbanData = extractTimeSeries(chartProps, 'expenses_urban');
        const ruralData = extractTimeSeries(chartProps, 'expenses_rural');
        labels = [...new Set([...urbanData.map(d=>d.year), ...ruralData.map(d=>d.year)])].sort();
        
        datasets = [
            { 
                type: 'line',
                label: 'Город (мес.)', 
                data: labels.map(y => { const i=urbanData.find(d=>d.year===y); return i?(i.value/12).toFixed(0):null; }),
                borderColor: '#e74c3c', fill: false, yAxisID: 'y'
            },
            { 
                type: 'line',
                label: 'Село (мес.)', 
                data: labels.map(y => { const i=ruralData.find(d=>d.year===y); return i?(i.value/12).toFixed(0):null; }),
                borderColor: '#27ae60', fill: false, yAxisID: 'y'
            }
        ];
        
        // Сброс осей к стандарту
        chartInstance.options.scales = { y: { display: true }, y1: { display: false } };

    // 3. СЦЕНАРИЙ: ОБЫЧНЫЕ МЕТРИКИ (ВРП, Преступность)
    } else {
        let prefix = '', label = '', color = '#3388ff', div = 1;
        if (activeMetric?.id === 'vrp_capita') { prefix = 'vrp'; label = 'ВРП (млн)'; color = '#27ae60'; }
        else if (activeMetric?.id === 'crime_rate') { prefix = 'crime'; label = 'Преступность'; color = '#e74c3c'; }

if (prefix) {
            const series = extractTimeSeries(chartProps, prefix);
            if (series.length > 0) {
                labels = series.map(d => d.year);
                datasets = [{
                    label: label,
                    data: series.map(d => (d.value / div).toFixed(0)),
                    borderColor: color, backgroundColor: color + '33', fill: true,
                    yAxisID: 'y'
                }];
            } else if (chartProps[prefix]) { // Обработка одиночного поля населения
                labels = ['Текущий показатель'];
                datasets = [{
                    label: label,
                    data: [(chartProps[prefix] / div).toFixed(0)],
                    borderColor: color, backgroundColor: color + '33', fill: true,
                    type: 'bar',
                    yAxisID: 'y'
                }];
            }
        } // <--- ПРОВЕРЬТЕ ЭТУ СКОБКУ
    } // Конец else

    document.getElementById('chart-title').innerText = regionName;
    chartInstance.data.labels = labels;
    chartInstance.data.datasets = datasets;
    chartInstance.update();
}

// --- ЛОГИКА РАСКРАСКИ КАРТЫ ---

function reapplyCurrentMetric() {
    const visiblePoly = MAP_CONFIG.adminLevels[currentLevel].layersToShow;

    visiblePoly.forEach(layerId => {
        const base = MAP_CONFIG.layersData[layerId].baseColor || '#ccc';
        
        if (!activeMetric) {
            map.setPaintProperty(layerId, 'fill-color', base);
            updateLegend(null);
            return;
        }

        let isApplied = false;

        // 1. ТОРГОВЛЯ (Переключатель Опт/Розница)
        if (activeMetric.type === 'trade-switch' && layerId === activeMetric.targetLayer) {
            const rule = activeMetric.modes[activeTradeMode];
            applyGradient(layerId, rule);
            updateLegend(rule, rule.legendTitle);
            isApplied = true;
        } 
        // 2. МУЛЬТИ-СЛОИ (Население)
        else if (activeMetric.type === 'multi-choropleth') {
            const rule = activeMetric.layers[layerId];
            if (rule) { 
                applyGradient(layerId, rule); 
                updateLegend(rule, activeMetric.legendTitle); 
                isApplied = true; 
            }
        } 
        // 3. ОБЫЧНЫЙ ХОРОПЛЕТ (ВРП, Преступность, Расходы)
        // Теперь они все работают одинаково, так как данные внутри GeoJSON
// Внутри цикла visiblePoly.forEach заменить блок choropleth:
else if (activeMetric.type === 'choropleth' && layerId === activeMetric.targetLayer) {
    if (activeMetric.id === 'expenses_total') {
        // Делим значение поля на 12 прямо в выражении MapLibre
        const expr = ['step', ['/', ['coalesce', ['get', activeMetric.field], 0], 12], activeMetric.colors[0]];
        for(let i=1; i<activeMetric.colors.length; i++) { expr.push(activeMetric.stops[i], activeMetric.colors[i]); }
        map.setPaintProperty(layerId, 'fill-color', expr);
    } else {
        applyGradient(layerId, activeMetric);
    }
    updateLegend(activeMetric, activeMetric.legendTitle);
    isApplied = true;
}

        // Сброс, если метрика не подходит слою
        if (!isApplied) {
            map.setPaintProperty(layerId, 'fill-color', base);
        }
    });
}

function applyGradient(layerId, rule) {
    // coalesce(..., 0) защищает от пустых значений (черных дыр на карте)
    const expr = ['step', ['coalesce', ['get', rule.field], 0], rule.colors[0]];
    for(let i=1; i<rule.colors.length; i++) {
        expr.push(rule.stops[i], rule.colors[i]);
    }
    map.setPaintProperty(layerId, 'fill-color', expr);
}

function updateLegend(rule, title) {
    const div = document.getElementById('legend-container');
    if (!rule) { div.style.display = 'none'; return; }
    
    let html = `<div class="legend-title">${title}</div>`;
    rule.colors.forEach((col, i) => {
        const start = rule.stops[i];
        const end = rule.stops[i+1];
        
        // Форматирование чисел
        const fmt = n => {
            if (n >= 1000000) return (n/1000000).toFixed(1)+'M';
            if (n >= 1000) return (n/1000).toFixed(0)+'k';
            return n.toLocaleString();
        };
        
        let label = `< ${fmt(rule.stops[1])}`;
        if (i > 0) label = !end ? `> ${fmt(start)}` : `${fmt(start)} - ${fmt(end)}`;
        
        html += `<div class="legend-item"><div class="legend-color" style="background:${col}"></div><span>${label}</span></div>`;
    });
    div.innerHTML = html;
    div.style.display = 'block';
}

// --- ВЗАИМОДЕЙСТВИЕ (UI) ---

function createLevelButtons() {
    const container = document.getElementById('levels-control');
    container.innerHTML = '';
    Object.entries(MAP_CONFIG.adminLevels).forEach(([key, conf]) => {
        const btn = document.createElement('button');
        btn.className = 'level-btn';
        btn.id = `btn-lvl-${key}`;
        btn.innerText = conf.name;
        btn.onclick = () => switchLevel(key);
        container.appendChild(btn);
    });
}

function switchLevel(levelKey) {
    currentLevel = levelKey;
    document.querySelectorAll('.level-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`btn-lvl-${levelKey}`);
    if(btn) btn.classList.add('active');

    const conf = MAP_CONFIG.adminLevels[levelKey];

    Object.keys(MAP_CONFIG.layersData).forEach(layer => {
        const isLayer = conf.layersToShow.includes(layer);
        const isBorder = conf.bordersToShow.includes(layer);
        const vis = (isLayer || isBorder) ? 'visible' : 'none';
        
        if (map.getLayer(layer)) map.setLayoutProperty(layer, 'visibility', vis);
        if (map.getLayer(layer+'_circle')) map.setLayoutProperty(layer+'_circle', 'visibility', vis);
    });

    if (activeMetric) reapplyCurrentMetric();
}

function createAccordion() {
    const list = document.getElementById('accordion-list');
    if (!list) return;
    list.innerHTML = '';
    
    MAP_CONFIG.categories.forEach((cat, idx) => {
        const item = document.createElement('div');
        item.className = 'acc-item';
        if (idx === 0) item.classList.add('active'); 

        const header = document.createElement('div');
        header.className = 'acc-header';
        header.innerText = cat.title;
        header.onclick = () => {
            document.querySelectorAll('.acc-item').forEach(el => {
                if (el !== item) el.classList.remove('active');
            });
            item.classList.toggle('active');
        };

        const body = document.createElement('div');
        body.className = 'acc-body';

        cat.items.forEach((metric, mIdx) => {
            const btnWrapper = document.createElement('div');

            // 1. ТОРГОВЛЯ (Switch)
            if (metric.type === 'trade-switch') {
                btnWrapper.className = 'trade-switch-container';
                btnWrapper.innerHTML = `
                    <div class="trade-title">${metric.label}</div>
                    <div class="trade-controls">
                        <label class="trade-radio-label ${activeTradeMode === 'retail' ? 'checked' : ''}" data-val="retail">
                            <input type="radio" name="tm_${metric.id}" value="retail" ${activeTradeMode === 'retail' ? 'checked' : ''}> Розница
                        </label>
                        <label class="trade-radio-label ${activeTradeMode === 'wholesale' ? 'checked' : ''}" data-val="wholesale">
                            <input type="radio" name="tm_${metric.id}" value="wholesale" ${activeTradeMode === 'wholesale' ? 'checked' : ''}> Опт
                        </label>
                    </div>`;
                
                btnWrapper.querySelector('.trade-title').onclick = () => activateMetric(metric, btnWrapper);
                const labels = btnWrapper.querySelectorAll('.trade-radio-label');
                labels.forEach(lbl => {
                    lbl.onclick = (e) => {
                        e.stopPropagation();
                        labels.forEach(l => {
                            l.classList.remove('checked');
                            l.querySelector('input').checked = false;
                        });
                        lbl.classList.add('checked');
                        lbl.querySelector('input').checked = true;
                        activeTradeMode = lbl.getAttribute('data-val');
                        
                        if (activeMetric === metric) reapplyCurrentMetric(); 
                        else activateMetric(metric, btnWrapper);
                    };
                });
            } 

// ... внутри createAccordion, в блоке else if (metric.type === 'toggle-dropdown')

else if (metric.type === 'toggle-dropdown') {
    btnWrapper.className = 'metric-option';
    btnWrapper.style.flexDirection = 'column';
    btnWrapper.style.alignItems = 'flex-start';

    // 1. Верхняя строка: Чекбокс + Текст
    const headerRow = document.createElement('div');
    headerRow.style.display = 'flex';
    headerRow.style.alignItems = 'center';
    headerRow.style.width = '100%';
    headerRow.style.cursor = 'pointer';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `chk-${metric.id}`;
    checkbox.style.marginRight = '8px';

    const label = document.createElement('span');
    label.innerText = metric.label;

    headerRow.appendChild(checkbox);
    headerRow.appendChild(label);

    // 2. Нижняя часть: Выпадающий список (скрыт по умолчанию)
    const dropdownContainer = document.createElement('div');
    dropdownContainer.style.marginTop = '8px';
    dropdownContainer.style.width = '100%';
    dropdownContainer.style.display = 'none'; // СКРЫТО
    dropdownContainer.style.paddingLeft = '20px';

    const select = document.createElement('select');
    select.className = 'map-dropdown';
    select.id = `dropdown-${metric.id}`;
    select.style.width = '100%';
    
    // Пустой пункт
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.innerText = '— Все типы продукции —';
    select.appendChild(defaultOpt);

    dropdownContainer.appendChild(select);

    // 3. Логика чекбокса (ВКЛ/ВЫКЛ слой и список)
    headerRow.onclick = (e) => {
        // Если клик не по самому чекбоксу, переключаем его
        if (e.target !== checkbox && e.target !== select) {
            checkbox.checked = !checkbox.checked;
        }

        if (checkbox.checked) {
            // ВКЛЮЧАЕМ
            dropdownContainer.style.display = 'block';
            if (map.getLayer(metric.targetLayer)) {
                map.setLayoutProperty(metric.targetLayer, 'visibility', 'visible');
                // Применяем фильтр, если что-то уже выбрано
                filterMapByMaterial(select.value, metric.targetLayer, metric.field);
            }
            
            // Загружаем данные в список (если он пуст)
            if (select.options.length <= 1) {
                 initMaterialDropdown(select.id, metric.targetLayer, metric.field);
            }
        } else {
            // ВЫКЛЮЧАЕМ
            dropdownContainer.style.display = 'none';
            if (map.getLayer(metric.targetLayer)) {
                map.setLayoutProperty(metric.targetLayer, 'visibility', 'none');
            }
        }
    };

    // 4. Логика списка (Фильтрация)
    select.onclick = (e) => e.stopPropagation(); // Чтобы не кликало по чекбоксу
    select.onchange = (e) => {
        filterMapByMaterial(e.target.value, metric.targetLayer, metric.field);
    };

    btnWrapper.appendChild(headerRow);
    btnWrapper.appendChild(dropdownContainer);
}

// 2. ВЫПАДАЮЩИЙ СПИСОК (НОВЫЙ КОД, КОТОРОГО НЕ БЫЛО)
            else if (metric.type === 'dropdown') {
                btnWrapper.className = 'metric-option dropdown-wrapper';
                btnWrapper.style.cursor = 'default';
                btnWrapper.style.flexDirection = 'column';
                btnWrapper.style.alignItems = 'flex-start';

                const label = document.createElement('div');
                label.className = 'dropdown-label';
                label.innerText = metric.label;
                label.style.marginBottom = '5px';
                label.style.fontSize = '12px';
                label.style.color = '#666';

                const select = document.createElement('select');
                select.className = 'map-dropdown'; // Убедитесь, что этот класс есть в CSS
                select.style.width = '100%';
                select.style.padding = '5px';
                select.id = `dropdown-${metric.id}`; // Важный ID

                const defaultOpt = document.createElement('option');
                defaultOpt.value = '';
                defaultOpt.innerText = '— Загрузка... —';
                select.appendChild(defaultOpt);

                // При изменении значения красим карту
                select.onchange = (e) => {
                    filterMapByMaterial(e.target.value, metric.targetLayer, metric.field);
                };

                btnWrapper.appendChild(label);
                btnWrapper.appendChild(select);
                
                // Запускаем наполнение списка (через небольшую задержку)
                setTimeout(() => {
                    initMaterialDropdown(select.id, metric.targetLayer, metric.field);
                }, 500);
            }

            // 3. ОБЫЧНЫЙ TOGGLE (Чекбокс)
            else if (metric.type === 'toggle') {
                 // ... ваш код для toggle (можно скопировать из старого файла) ...
                 btnWrapper.className = 'metric-option';
                 btnWrapper.innerHTML = `<input type="checkbox" id="chk-${metric.id}" style="margin-right:8px;"> ${metric.label}`;
                 btnWrapper.onclick = (e) => {
                    const chk = btnWrapper.querySelector('input');
                    if (e.target !== chk) chk.checked = !chk.checked;
                    toggleLayer(metric);
                 };
            }
            
            // 4. ОБЫЧНАЯ КНОПКА
            else {
                btnWrapper.className = 'metric-option';
                btnWrapper.innerText = metric.label;
                btnWrapper.onclick = () => activateMetric(metric, btnWrapper);
            }

            body.appendChild(btnWrapper);
        });

        item.appendChild(header);
        item.appendChild(body);
        list.appendChild(item);
    });
}

function activateMetric(metric, uiEl) {
    document.querySelectorAll('.metric-option, .trade-switch-container').forEach(e => e.classList.remove('active'));
    if (uiEl) uiEl.classList.add('active');
    
    // Очищаем подсветку
    if(map.getSource('highlight-source')) {
        map.getSource('highlight-source').setData({type: 'FeatureCollection', features: []});
    }

    activeMetric = metric;
    reapplyCurrentMetric();
}

// Пример логики внутри функции переключения слоев
function toggleLayer(metric) {
    if (metric.id === 'toggle_manufacturers') {
        const isChecked = document.getElementById(`chk-${metric.id}`).checked;
        
        if (isChecked) {
            // Показываем только города, которые есть в ключах нашего реестра
            const citiesWithProducers = Object.keys(manufacturersRegistry);
            map.setFilter('towns', ['in', ['get', 'name'], ['literal', citiesWithProducers]]);
            map.setLayoutProperty('towns', 'visibility', 'visible');
        } else {
            // Сбрасываем фильтр и скрываем слой (или показываем все города обратно)
            map.setFilter('towns', null);
            map.setLayoutProperty('towns', 'visibility', 'none');
        }
    }
}

function loadIcons() {
    Object.entries(MAP_CONFIG.icons).forEach(([name, url]) => {
        map.loadImage(url, (e, img) => { if (!e && !map.hasImage(name)) map.addImage(name, img); });
    });
}

// --- POPUP INTERACTION ---

function setupInteraction(layerId, conf) {
    if (conf.interactive === false) return;

    // СОЗДАЕМ МАССИВ СЛОЕВ ДЛЯ КЛИКА
    const layersToListen = [layerId];
    if (conf.type === 'point-icon') {
        layersToListen.push(layerId + '_circle'); // Добавляем подложку-кружок
    }

    // Слушаем наведение на оба слоя
    layersToListen.forEach(id => {
        map.on('mouseenter', id, () => map.getCanvas().style.cursor = 'pointer');
        map.on('mouseleave', id, () => map.getCanvas().style.cursor = '');
    });

    // МЕНЯЕМ map.on('click', layerId, ...) НА МАССИВ:
    map.on('click', layersToListen, (e) => {
        const f = e.features[0];
        const p = f.properties;
        
        if (conf.type === 'fill') map.getSource('highlight-source').setData(f.geometry);
        
        // 1. Обновляем график
        try {
            updateChart(p);
        } catch (err) { console.error("Ошибка графика:", err); }

        // 2. Формируем HTML Попапа
        let title = p['ADM_2_rus'] || p['name'] || " ";
        let sub = p['ADM1_EN'] || "";
        let content = "";
        let footer = "";

if (layerId === 'districts') {
    const districtName = p['ADM2_rus'] || p['ADM_2_rus'] || p['name'] || p['NAME_2'] || "Район";
    const regionName  = p['ADM1_rus'] || p['ADM1_EN']  || "";
    const population  = (p['Численность населения'] || p['popul'] || 0).toLocaleString('ru-RU');

    title = districtName;
    sub   = regionName;

    content = `
        <div class="popup-row"><span>Область:</span> <b>${escapeHtml(regionName)}</b></div>
        <div class="popup-row"><span>Район:</span>  <b>${escapeHtml(districtName)}</b></div>
        <div class="popup-row"><span>Население:</span> <b>${population} чел.</b></div>
    `;

    if (activeMetric?.id === 'food_balance') {
        content += `<div class="popup-scroll-container">`;

const groups = {
            "Зерновые и мука": [
                "Мука пшеничная высшего сорта и 1 сорта", "Хлеб ржаной", "Хлеб ржано-пшеничный", 
                "Хлеб пшеничный (хлеб и сдобные булочки из муки пшеничной высшего сорта и 1 сорта)", 
                "Макаронные изделия", "Крупа гречневая", "Крупа рисовая", "Крупа манная", 
                "Крупа овсяная", "Крупа пшенная", "Крупа перловая", "Бобовые (бобы, горох, фасоль красная и белая, чечевица, нут, соя, маш, люпин)"
            ],
            "Овощи и бахчевые": [
                "Картофель", "Капуста (белокочанная, краснокочанная, брюссельская, пекинская, савойская цветная, брокколи, кольраби)", 
                "Морковь", "Лук репчатый", "Огурцы", "Томаты", "Свекла", "Перец сладкий", "Зелень (петрушка, лук зеленый, укроп, салат листовой, кинза, шпинат, латук, сельдерей, щавель)", 
                "Овощи (баклажаны, кабачок, патиссоны, пастернак, цукини, редис, редька, репа, чеснок, горошек зеленый, включая консервированные и соленые)", 
                "Тыква", "Арбуз (август-октябрь)", "Дыня (август-октябрь)"
            ],
            "Фрукты и ягоды": [
                "Фрукты и ягоды (общее количество)", "Яблоки", "Слива, груша, абрикосы, персики, хурма, гранат", 
                "Плоды суб - и тропические (апельсины, бананы, киви, мандарины, клементины, ананасы, авокадо, гуава, манго, маракуйя, папайя, грейпфрут)", 
                "Лимон", "Сухофрукты", "Ягоды (виноград, вишня, черешня, смородина, малина, черника, клубника, земляника, ежевика, крыжовник, клюква, брусника, шиповник, облепиха)", 
                "Сок плодово-ягодный"
            ],
            "Мясо и рыба": [
                "Баранина", "Говядина", "Конина", "Свинина", "Субпродукты (печень, сердце, почки, легкие, мозги )", 
                "Мясо птицы", "Колбасные изделия", "Рыба свежая и свежемороженая", "Рыбные консервы", "Морепродукты, в том числе и морская капуста"
            ],
            "Молочные продукты и яйца": [
                "Яйца куриные, штук/год", "Молоко и молочные продукты (общее количество)", "Молоко коровье", 
                "Молоко кобылье, верблюжье, козье", "Кумыс, шубат", "Кисломолочные жидкие продукты из коровьего молока", 
                "Сметана", "Творог полужирный", "Сыр сычужный", "Масло коровье (жира животного > 75 %)"
            ],
            "Прочее": [
                "Масло растительное", "Сахар", "Кондитерские изделия", "Мед пчелиный", "Чай", 
                "Кофе натуральный", "Какао порошок", "Дрожжи", "Лавровый лист", "Перец молотый", "Уксус", "Соль пищевая йодированная"
            ],
        };

        for (const [groupName, fields] of Object.entries(groups)) {
            const hasData = fields.some(f => p[f] !== undefined && p[f] !== null && String(p[f]).trim() !== "");
            if (!hasData) continue;

            content += `<div class="product-group-title">${groupName}</div>`;
            content += `<div class="dist-prod-grid">`;

            fields.forEach(field => {
                let val = p[field];
                if (val == null || String(val).trim() === "") return;
                const unit = field.includes("штук") ? "шт" : "т";  
                content += `
                    <div class="dist-prod-item">
                        <span class="dist-prod-name">${escapeHtml(field.split('(')[0].trim())}</span>
                        <span class="dist-prod-val">${escapeHtml(val)} ${unit}</span>
                    </div>`;
            });

            content += `</div>`;
        }

        content += `</div>`;  // конец .popup-scroll-container
    }

    // Если ничего не добавилось — показываем хотя бы базовую информацию
    if (content === '') {
        content = '<div class="popup-row">Нет данных по району</div>';
    }
}
else if (layerId === 'balance') {
            // Базовая информация: Население
            const popVal = parseFloat(p['popul'] || 0);
            content = `<div class="popup-row"><span>Население:</span> <b>${popVal.toLocaleString('ru-RU')}</b></div>`;

            // Если выбрана категория "Продовольственный баланс"
            if (activeMetric?.id === 'food_balance') {
                content += `<div style="font-weight: bold; margin: 10px 0 5px 0; border-top: 1px solid #eee; padding-top: 5px;">Потоки товаров:</div>`;
                content += `<div class="bal-item-container">`;

                const products = [
                    "Лук репчатый", "Сахар-песок", "Картофель", "Морковь", 
                    "Капуста белокочанная", "Масло подсолнечное", "Масло сливочное несоленое", 
                    "Молоко пастеризованное", "Творог 5-9% жирности", "Говядина с костями", 
                    "Рожки", "Мука пшеничная первого сорта", "Рис шлифованный, полированный", 
                    "Яйца, 1 категории", "Соль, кроме экстра"
                ];

                products.forEach(prod => {
                    const rawVal = p[prod]; // Например: "г. Алматы (53.33)"
                    if (rawVal && rawVal.trim() !== "") {
                        // Регулярное выражение для вытаскивания "Имя региона" и "Число"
                        const match = rawVal.match(/^(.*?)\s*\((\d+(?:[.,]\d+)?)\)$/);
                        
                        let region = rawVal;
                        let percent = 0;
                        let colorClass = "";

                        if (match) {
                            region = match[1].trim();
                            percent = parseFloat(match[2].replace(',', '.'));

                            // Логика окрашивания
                            if (percent > 30) colorClass = "markup-red";
                            else if (percent >= 15) colorClass = "markup-yellow";
                            else colorClass = "markup-green";
                        }

                        content += `
                            <div class="bal-card">
                                <span class="bal-prod-name">${prod}</span>
                                <span class="bal-dest">→ ${region}</span>
                                <span class="bal-pct ${colorClass}">Наценка: ${percent}%</span>
                            </div>`;
                    }
                });
                

                content += `</div>`;
            }
            // ВРП НА ДУШУ НАСЕЛЕНИЯ
            if (activeMetric?.id === 'vrp_capita') {
                const val = parseFloat(p['vrp'] || 0); 
                content += `<div class="popup-row"><span>ВРП на душу:</span> <b>${val.toLocaleString('ru-RU')} млн ₸</b></div>`;
            } 
            // КОЛИЧЕСТВО ПРЕСТУПЛЕНИЙ (crime_2021)
            else if (activeMetric?.id === 'crime_rate') {
                const val = parseFloat(p['crime_2021'] || 0);
                content += `<div class="popup-row"><span>Преступность (2021):</span> <b>${val.toLocaleString('ru-RU')} ед.</b></div>`;
            }
            // ПОТРЕБИТЕЛЬСКИЕ РАСХОДЫ (Делим на 12)
            else if (activeMetric?.id === 'expenses_total') {
                const val = parseFloat(p['expenses_total_2024'] || 0);
                const monthly = val / 12;
                
                content += `<div class="popup-row"><span>Расходы (мес):</span> <b>${monthly.toLocaleString('ru-RU', {maximumFractionDigits: 0})} ₸</b></div>`;
                content += `<div style="font-size: 10px; color: #666; margin-top: 5px; text-align: center;">(см. динамику ниже)</div>`;
            }
        }
else if (layerId === 'towns') {
            const cityName = p['name'];
            let factories = [];
            
            // Парсим данные о заводах из GeoJSON
            try {
                // Внимание: проверьте, как называется поле в вашем итоговом файле (factories_data или factories_json)
                // Судя по присланному файлу towns.geojson, поле называется "factories_data"
                factories = typeof p['factories_data'] === 'string' 
                    ? JSON.parse(p['factories_data']) 
                    : (p['factories_data'] || []);
            } catch (e) { 
                console.error("Ошибка чтения данных завода:", e); 
            }

            // 1. ПОЛУЧАЕМ ТЕКУЩИЙ ФИЛЬТР
            // Ищем наш выпадающий список по ID (он формируется как dropdown + id из конфига)
            const dropdown = document.getElementById('dropdown-manufacturers_filter');
            const selectedCategory = dropdown ? dropdown.value : '';

            // 2. ФИЛЬТРУЕМ СПИСОК
            // Если в списке что-то выбрано, оставляем только подходящие заводы
            if (selectedCategory && selectedCategory !== '') {
                factories = factories.filter(f => f['Классификация'] === selectedCategory);
            }

            if (factories.length > 0) {
                title = cityName;
                // Красивый подзаголовок
                const countText = factories.length + (factories.length === 1 ? ' производитель' : ' производителей');
                sub = selectedCategory 
                    ? `<span style="color:white; font-weight:600;">${selectedCategory}</span> <span style="color:#7f8c8d;">(${countText})</span>`
                    : `Всего производителей: ${factories.length}`;

                // Формируем карточки заводов
                content = factories.map(f => `
                    <div class="producer-card" style="margin-bottom: 12px; border-bottom: 1px solid #eee; padding-bottom: 8px;">
                        <div style="font-weight:bold; color:#007aff; font-size:14px; margin-bottom:4px;">
                            ${f['Наименование производителей']}
                        </div>
                        <div style="font-size:12px; line-height:1.5; color:#333;">
                            <div style="display:flex; justify-content:space-between;">
                                <span style="color:#666;">Продукция:</span>
                                <span style="text-align:right; font-weight:500;">${f['Виды материалов'] || f['Классификация']}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; margin-top:2px;">
                                <span style="color:#666;">Мощность:</span>
                                <b>${f['Производственная мощность в год'] || '-'}</b>
                            </div>
                            <div style="margin-top:6px; padding-top:4px; border-top:1px dashed #eee; color:#555;">
                                📞 ${f['Контакты'] || 'нет данных'}
                            </div>
                        </div>
                    </div>
                `).join('');
            } else {
                // Если фильтр выбран, но заводов нет (такое бывает редко, если точки фильтруются, но на всякий случай)
                title = cityName;
                if (selectedCategory) {
                    content = `<div class="popup-row" style="color:#666;">В этом городе нет производителей категории <b>"${selectedCategory}"</b></div>`;
                } else {
                    // Если фильтра нет и заводов нет — показываем население
                    content = `<div class="popup-row">Население: ${p['popul'] ? p['popul'].toLocaleString() : 'нет данных'}</div>`;
                }
            }
        }
        else if (layerId === 'storages') {
            title = "Овощехранилище";
            content = `<div class="popup-row"><b>${p['Наименование компании владельца']}</b></div><div class="popup-row">Мощность: ${p['Мощность овощехранилища, в тоннах']} т</div>`;
        }
        else if (layerId === 'fairs') {
            title = "Ярмарка";
            content = `<div class="popup-row">${p['Адрес'] || 'Адрес не указан'}</div>`;
        }

        if (!content) content = `<div class="popup-row">Нет данных</div>`;

        const html = `
            <div class="popup-header"><span class="popup-title-main">${title}</span>${sub?`<span class="popup-subtitle">${sub}</span>`:''}</div>
            <div class="popup-body">${content}</div>
            ${footer}
        `;
        new maplibregl.Popup().setLngLat(e.lngLat).setHTML(html).addTo(map);
    });
}

function toggleChartFullscreen() {
    const wrapper = document.getElementById('chart-wrapper');
    wrapper.classList.toggle('fullscreen');
    wrapper.classList.remove('collapsed'); // Если был свернут
    
    // Перерисовываем график, чтобы он адаптировался к новому размеру
    setTimeout(() => chartInstance.resize(), 300);
}

function toggleChartCollapse() {
    const wrapper = document.getElementById('chart-wrapper');
    const btn = document.getElementById('collapse-btn');
    
    wrapper.classList.toggle('collapsed');
    wrapper.classList.remove('fullscreen'); // Если был на весь экран
    
    if (wrapper.classList.contains('collapsed')) {
        btn.innerText = 'Развернуть график';
    } else {
        btn.innerText = 'Свернуть';
        setTimeout(() => chartInstance.resize(), 300);
    }
}

// map.js

// 1. Функция фильтрации (раскраски) карты
// map.js

function filterMapByMaterial(selectedValue, layerId, fieldName) {
    if (!map.getLayer(layerId)) return;

    // Определяем тип слоя, чтобы знать, какое свойство красить
    const layerType = map.getLayer(layerId).type;
    const paintProp = layerType === 'circle' ? 'circle-color' : 'fill-color';
    
    // Цвет по умолчанию (если фильтр сброшен)
    // Для точек синий, для полигонов серый
    const defaultColor = layerType === 'circle' ? '#007aff' : '#ccc'; 

    if (!selectedValue) {
        // Сбрасываем фильтр: возвращаем всем исходный цвет
        map.setPaintProperty(layerId, paintProp, defaultColor);
        
        // Если это точки, можно вернуть им исходный радиус
        if (layerType === 'circle') {
             map.setPaintProperty(layerId, 'circle-radius', 6);
             map.setPaintProperty(layerId, 'circle-stroke-color', '#fff');
        }
        return;
    }

    // ЛОГИКА ОКРАШИВАНИЯ
    map.setPaintProperty(layerId, paintProp, [
        'case',
        // Проверяем: содержится ли выбранное значение в массиве fieldName
        ['in', selectedValue, ['get', fieldName]], 
        '#4caf50', // ЗЕЛЕНЫЙ: если город производит этот товар
        '#e0e0e0'  // СЕРЫЙ: если не производит
    ]);

    // ЛОГИКА РАЗМЕРА (Только для точек)
    // Делаем подходящие города чуть больше, а неподходящие — меньше
    if (layerType === 'circle') {
        map.setPaintProperty(layerId, 'circle-radius', [
            'case',
            ['in', selectedValue, ['get', fieldName]],
            9,  // Большой радиус для подходящих
            4   // Маленький для остальных
        ]);
        
        // Убираем обводку у неактивных, добавляем активным
        map.setPaintProperty(layerId, 'circle-stroke-color', [
            'case',
            ['in', selectedValue, ['get', fieldName]],
            '#ffffff', // Белая обводка для активных
            'transparent' // Без обводки для неактивных
        ]);
    }
}

// 2. Функция для загрузки списка товаров в выпадающий список
async function initMaterialDropdown(selectId, layerId, fieldName) {
    const select = document.getElementById(selectId);
    if (!select) return;

    try {
        // Убедитесь, что путь к файлу в MAP_CONFIG верный
        const layerConfig = MAP_CONFIG.layersData[layerId];
        if (!layerConfig) return;

        const response = await fetch(layerConfig.file);
        const data = await response.json();

        const uniqueValues = new Set();
        
        data.features.forEach(feature => {
            let val = feature.properties[fieldName];
            
            if (val) {
                // Если это строка, которая выглядит как массив JSON: '["А", "Б"]'
                if (typeof val === 'string' && val.startsWith('[')) {
                    try {
                        const parsed = JSON.parse(val);
                        if (Array.isArray(parsed)) parsed.forEach(v => uniqueValues.add(v));
                    } catch (e) { console.error("Ошибка парсинга поля:", fieldName); }
                } 
                // Если это уже массив (нативный JSON)
                else if (Array.isArray(val)) {
                    val.forEach(v => uniqueValues.add(v));
                }
                // Если это просто строка
                else {
                    uniqueValues.add(val);
                }
            }
        });

        // Очищаем и заполняем
        select.innerHTML = '<option value="">— Не выбрано —</option>';
        Array.from(uniqueValues).sort().forEach(val => {
            if (val && val !== "[]") {
                const option = document.createElement('option');
                option.value = val;
                option.text = val;
                select.appendChild(option);
            }
        });

    } catch (error) {
        console.error("Ошибка загрузки данных для списка:", error);
    }
}

async function loadManufacturersData() {
    try {
        const response = await fetch('data/reestr.json');
        if (!response.ok) throw new Error(`Файл не найден (Status: ${response.status})`);
        
        const data = await response.json();
        
        manufacturersRegistry = {}; 

        data.forEach(item => {
            const city = item["name"];  // Используем "name" вместо "Город/поселок/село производства"
            if (city) {
                if (!manufacturersRegistry[city]) manufacturersRegistry[city] = [];
                manufacturersRegistry[city].push(item);
            }
        });
        console.log("Реестр производителей успешно загружен", manufacturersRegistry);  // Добавьте для отладки
    } catch (e) {
        console.error("Ошибка загрузки реестра:", e.message);
        manufacturersRegistry = null; 
    }
}