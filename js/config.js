const MAP_CONFIG = {
    center: [67.0, 48.0],
    zoom: 4,
    style: {
        version: 8,
        sources: {
            'osm': {
                type: 'raster',
                tiles: ["https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"],
                tileSize: 256,
                attribution: '&copy; OpenStreetMap &copy; CARTO'
            }
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
    },
    icons: {
        'icon-town': 'img/town.png',
        'icon-fair': 'img/fair.png',
        'icon-storage': 'img/storage.png'
    },

    adminLevels: {
        republic: { name: "Республиканский", layersToShow: ['balance'], bordersToShow: ['kazborder'] },
        oblast: { name: "Областной", layersToShow: ['districts'], bordersToShow: ['kazborder', 'oblborders'] },
        rayon: { name: "Районный", layersToShow: ['okruga'], bordersToShow: ['kazborder', 'oblborders', 'districtsborder'] },
        settlement: { name: "Нас. пункты", layersToShow: ['towns'], bordersToShow: ['kazborder', 'oblborders', 'districtsborder'] }
    },

    categories: [
        {
            id: 'general', title: '1. Общие сведения',
            items: [
                {
                    id: 'population', label: 'Численность населения',
                    type: 'multi-choropleth', legendTitle: "Численность (чел.)",
                    layers: {
                        'balance': { field: 'popul', stops: [0, 500000, 1000000, 1500000, 2000000], colors: ['#deebf7', '#9ecae1', '#6baed6', '#3182bd', '#08519c'] },
                        'districts': { field: 'Численность населения', stops: [0, 15000, 30000, 50000, 100000, 200000], colors: ['#eff3ff', '#c6dbef', '#9ecae1', '#6baed6', '#3182bd', '#08519c'] }
                    }
                }
            ]
        },
        { 
            id: 'safety', 
            title: '2. Безопасность и правопорядок', 
            items: [
                {
                    // Теперь это обычный choropleth, ссылающийся на поле последнего года
                    id: 'crime_rate', label: 'Количество преступлений',
                    type: 'choropleth', targetLayer: 'balance',
                    field: 'crime_per_10k',
                    legendTitle: "Преступлений на 10 тыс. чел.",
                    stops: [0, 27, 59, 88, 118, 171],
                    colors: ['#fee5d9', '#fcbba1', '#fc9272', '#fb6a4a', '#de2d26', '#a50f15']
                }
            ] 
        },
        {
            id: 'economy', title: '3. Экономика и торговля',
            items: [
                {
                    id: 'trade_volume', label: 'Объем торговли', type: 'trade-switch', targetLayer: 'districts',
                    modes: {
                        retail: { field: 'Розничная торговля', legendTitle: "Розница (млн ₸)", stops: [0, 1000000, 5000000, 10000000, 50000000, 100000000], colors: ['#f2f0f7', '#dadaeb', '#bcbddc', '#9e9ac8', '#756bb1', '#54278f'] },
                        wholesale: { field: 'Оптовая торговля', legendTitle: "Опт (млн ₸)", stops: [0, 5000000, 20000000, 50000000, 100000000, 500000000], colors: ['#fff5f0', '#dadaeb', '#bcbddc', '#9e9ac8', '#756bb1', '#54278f'] }
                    }
                },
                {
                    id: 'vrp_capita', label: 'ВРП (на душу населения)', type: 'choropleth', targetLayer: 'balance',
                    field: 'vrp', // Укажите актуальный год данных
                    stops: [0, 1400, 2500, 3200, 5800, 10508],
                    colors: ['#fee5d9', '#fcbba1', '#fc9272', '#fb6a4a', '#de2d26', '#a50f15']
                },
                // --- НОВАЯ МЕТРИКА: ПОТРЕБИТЕЛЬСКИЕ РАСХОДЫ ---
                {
                    id: 'expenses_total', label: 'Потреб. расходы (Всего)', type: 'choropleth', targetLayer: 'balance',
                    field: 'expenses_total_2024', // Картограмма строится по полю "Всего" за последний год
                    legendTitle: "Расходы на душу (тенге)",
                    stops: [0, 3020000, 3240000, 3560000, 3839000, 4242000], // Примерные диапазоны
                    colors: ['#fff7bc', '#fee391', '#fec44f', '#fe9929', '#ec7014', '#cc4c02'] // Оранжевая гамма
                },
                {
                id: 'raw_materials_toggle',
                label: 'Перспективные регионы',
                type: 'toggle-dropdown', // Новый комбинированный тип
                targetLayer: 'balance',
                field: 'Материал/оборудование', // Поле для фильтра
                popupField: 'combined_info'     // Поле для содержимого Popup
                },
                {
                id: 'manufacturers_filter',
                label: 'Реестр производителей', // Текст возле галочки
                type: 'toggle-dropdown',         // <-- ВАЖНО: меняем тип
                targetLayer: 'towns',            // ID слоя городов
                field: 'classifications'         // Поле с массивом типов продукции
                },
                // ----------------------------------------------
                {
                    id: 'food_balance', label: 'Продовольственный баланс', type: 'analysis', targetLayer: 'districts',
                    productFields: ["Лук репчатый", "Сахар-песок", "Картофель", "Морковь", "Капуста белокочанная", "Масло подсолнечное", "Масло сливочное несоленое", "Молоко пастеризованное", "Творог 5-9% жирности", "Говядина с костями", "Рожки", "Мука пшеничная первого сорта", "Рис шлифованный, полированный", "Яйца, 1 категории", "Соль, кроме экстра"]
                },
                { id: 'layer_storages', label: 'Овощехранилища', type: 'toggle', layer: 'storages' },
                { id: 'layer_fairs', label: 'Ярмарки', type: 'toggle', layer: 'fairs' }
            ]
        },
        { id: 'construction', title: '4. Строительство и инфраструктура', items: [] },
        { id: 'ecology', title: '5. Экология и природопользование', items: [] },
        {
            id: 'social', title: '6. Социальное развитие',
            items: [
                { id: 'queue_mio', label: 'Очередники МИО', type: 'choropleth', targetLayer: 'balance', legendTitle: "Кол-во очередников", field: 'estate_demand', stops: [0, 20000, 26000, 32000, 38000, 45000], colors: ['#fee5d9', '#fcbba1', '#fc9272', '#fb6a4a', '#de2d26', '#a50f15'] },
                { id: 'susn', label: 'Соц. уязвимые слои населения', type: 'choropleth', targetLayer: 'districts', legendTitle: "СУСН (человек)", field: 'СУСН (человек)', stops: [0, 650, 2000, 4000, 7000], colors: ['#edf8e9', '#bae4b3', '#74c476', '#31a354', '#006d2c'] }
            ]
        },
        { id: 'culture', title: '7. Культура и туризм', items: [] },
    ],

    layersData: {
        balance: { file: 'data/balance.geojson', type: 'fill', baseColor: '#ccc', idField: 'ADM_2_rus' },
        districts: { file: 'data/districts.geojson', type: 'fill', baseColor: '#999' },
        okruga: { file: 'data/okruga.geojson', type: 'fill', baseColor: '#607d8b', opacity: 0.4, borderColor: '#cfd8dc' },
        kazborder: { file: 'data/kazborder.geojson', type: 'line', color: '#000', width: 2, interactive: false },
        oblborders: { file: 'data/oblborders.geojson', type: 'line', color: '#333', width: 1.5, interactive: false },
        districtsborder: { file: 'data/districtsborder.geojson', type: 'line', color: '#666', width: 0.5, dashArray: [2, 2], interactive: false },
        towns: { file: 'data/towns.geojson', type: 'point-icon', icon: 'icon-town', color: '#000', size: 5 },
        fairs: { file: 'data/fairs.geojson', type: 'point-icon', icon: 'icon-fair', color: '#e74c3c', size: 6 },
        storages: { file: 'data/storages.geojson', type: 'point-icon', icon: 'icon-storage', color: '#8e44ad', size: 6 }
    }
};