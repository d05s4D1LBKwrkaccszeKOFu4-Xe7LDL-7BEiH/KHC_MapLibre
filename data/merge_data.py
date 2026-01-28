import json
import os
import re

# ==========================================
# 1. НАСТРОЙКИ: ДОБАВЛЯЙТЕ НОВЫЕ ФАЙЛЫ СЮДА
# ==========================================

# Как добавить следующий файл самостоятельно?
# Допустим, через месяц у вас появится файл obrazovanie.json (образование) с делением на "школы" и "вузы".
# Открываете universal_merge.py в любом текстовом редакторе (Блокнот, VS Code).
# Находите список DATA_SOURCES.
# Добавляете в него новый блок (не забудьте запятую после предыдущего блока):
# Python
#     {
#         "file": "obrazovanie.json",
#         "prefix": "edu", 
#         "subtypes": {
#             "Школьные учреждения": "_school",  # создаст поле edu_school_2023
#             "Высшие учебные заведения": "_uni" # создаст поле edu_uni_2023
#         }
#     }
# Запускаете скрипт: python universal_merge.py.
# Заменяете старый balance.geojson на новый balance_updated.geojson.

GEOJSON_FILE = 'balance.geojson'       # Исходный файл карты
OUTPUT_FILE = 'balance_updated.geojson' # Куда сохранить результат

# Словарь для исправления названий регионов (если в JSON они написаны криво)
REGION_MAPPING = {
    "Abai Region": "ОБЛАСТЬ АБАЙ",
    "ОБЛАСТЬ АБАЙ": "ОБЛАСТЬ АБАЙ",
    
    "Jetisu Region": "ОБЛАСТЬ ЖЕТІСУ",
    "ОБЛАСТЬ ЖЕТІСУ": "ОБЛАСТЬ ЖЕТІСУ",
    
    "Ulytau Region": "ОБЛАСТЬ ҰЛЫТАУ",
    "ОБЛАСТЬ ҰЛЫТАУ": "ОБЛАСТЬ ҰЛЫТАУ",
    
    "Akmola Region": "АКМОЛИНСКАЯ ОБЛАСТЬ",
    "АКМОЛИНСКАЯ ОБЛАСТЬ": "АКМОЛИНСКАЯ ОБЛАСТЬ",
    
    "Aktobe Region": "АКТЮБИНСКАЯ ОБЛАСТЬ",
    "АКТЮБИНСКАЯ ОБЛАСТЬ": "АКТЮБИНСКАЯ ОБЛАСТЬ",
    
    "Almaty Region": "АЛМАТИНСКАЯ ОБЛАСТЬ",
    "АЛМАТИНСКАЯ ОБЛАСТЬ": "АЛМАТИНСКАЯ ОБЛАСТЬ",
    
    "Atyrau Region": "АТЫРАУСКАЯ ОБЛАСТЬ",
    "АТЫРАУСКАЯ ОБЛАСТЬ": "АТЫРАУСКАЯ ОБЛАСТЬ",
    
    "West Kazakhstan Region": "ЗАПАДНО-КАЗАХСТАНСКАЯ ОБЛАСТЬ",
    "ЗАПАДНО-КАЗАХСТАНСКАЯ ОБЛАСТЬ": "ЗАПАДНО-КАЗАХСТАНСКАЯ ОБЛАСТЬ",
    
    "Jambyl Region": "ЖАМБЫЛСКАЯ ОБЛАСТЬ",
    "ЖАМБЫЛСКАЯ ОБЛАСТЬ": "ЖАМБЫЛСКАЯ ОБЛАСТЬ",
    
    "Karaganda Region": "КАРАГАНДИНСКАЯ ОБЛАСТЬ",
    "КАРАГАНДИНСКАЯ ОБЛАСТЬ": "КАРАГАНДИНСКАЯ ОБЛАСТЬ",
    
    "Kostanay Region": "КОСТАНАЙСКАЯ ОБЛАСТЬ",
    "КОСТАНАЙСКАЯ ОБЛАСТЬ": "КОСТАНАЙСКАЯ ОБЛАСТЬ",
    
    "Kyzylorda Region": "КЫЗЫЛОРДИНСКАЯ ОБЛАСТЬ",
    "КЫЗЫЛОРДИНСКАЯ ОБЛАСТЬ": "КЫЗЫЛОРДИНСКАЯ ОБЛАСТЬ",
    
    "Mangystau Region": "МАНГИСТАУСКАЯ ОБЛАСТЬ",
    "МАНГИСТАУСКАЯ ОБЛАСТЬ": "МАНГИСТАУСКАЯ ОБЛАСТЬ",
    
    "Pavlodar Region": "ПАВЛОДАРСКАЯ ОБЛАСТЬ",
    "ПАВЛОДАРСКАЯ ОБЛАСТЬ": "ПАВЛОДАРСКАЯ ОБЛАСТЬ",
    
    "North Kazakhstan Region": "СЕВЕРО-КАЗАХСТАНСКАЯ ОБЛАСТЬ",
    "СЕВЕРО-КАЗАХСТАНСКАЯ ОБЛАСТЬ": "СЕВЕРО-КАЗАХСТАНСКАЯ ОБЛАСТЬ",
    
    "East Kazakhstan Region": "ВОСТОЧНО-КАЗАХСТАНСКАЯ ОБЛАСТЬ",
    "ВОСТОЧНО-КАЗАХСТАНСКАЯ ОБЛАСТЬ": "ВОСТОЧНО-КАЗАХСТАНСКАЯ ОБЛАСТЬ",
    
    "Turkistan Region": "ТУРКЕСТАНСКАЯ ОБЛАСТЬ",
    "ТУРКЕСТАНСКАЯ ОБЛАСТЬ": "ТУРКЕСТАНСКАЯ ОБЛАСТЬ",
    
    "Astana City": "Г.АСТАНА",
    "Г.АСТАНА": "Г.АСТАНА",
    "Astana": "Г.АСТАНА",
    
    "Almaty City": "Г.АЛМАТЫ",
    "Г.АЛМАТЫ": "Г.АЛМАТЫ",
    "Almaty": "Г.АЛМАТЫ",
    
    "Shymkent City": "Г.ШЫМКЕНТ",
    "Г.ШЫМКЕНТ": "Г.ШЫМКЕНТ",
    "Shymkent": "Г.ШЫМКЕНТ"
}

# СПИСОК ИСТОЧНИКОВ ДАННЫХ
DATA_SOURCES = [
    # 1. ВРП (Простой случай: один регион = одно значение)
    {
        "file": "2709379-vvp-metodom-proizvodstva.json",
        "prefix": "vrp"  # В geojson появятся поля: vrp_2023, vrp_2024...
    },
    
    # 2. ПРЕСТУПНОСТЬ (Нужен фильтр: берем только итоги года "Декабрь")
    {
        "file": "704767-kolichestvo-prestupleniy.json",
        "prefix": "crime", # Поля: crime_2023, crime_2024...
        "filter_keywords": ["Декабрь", "год"] # Брать период, только если в названии есть эти слова
    },

    # 3. ПОТРЕБИТЕЛЬСКИЕ РАСХОДЫ (Сложный случай: деление на Город/Село/Всего)
    {
        "file": "potreb-rashody.json",
        "prefix": "expenses", # Базовое имя поля
        
        # Словарь подтипов: Если в termNames найдено слово слева -> добавить суффикс справа
        "subtypes": {
            "Всего": "_total",                 # expenses_total_2023
            "сельская местность": "_rural",    # expenses_rural_2023
            "городская местность": "_urban"    # expenses_urban_2023
        }
    }
]

# ==========================================
# 2. ЛОГИКА СКРИПТА (МЕНЯТЬ НЕ НУЖНО)
# ==========================================

def normalize(text):
    """Приводит название региона к единому виду (верхний регистр, без пробелов)"""
    return str(text).strip().upper() if text else ""

def get_year_from_period(period):
    """Пытается найти год в дате (31.12.2023) или названии (2023 год)"""
    # 1. Пробуем из даты "31.12.2023"
    date_str = period.get('date', '')
    if '.' in date_str:
        return date_str.split('.')[-1]
    
    # 2. Пробуем найти 4 цифры в названии "2023 год"
    match = re.search(r'\d{4}', period.get('name', ''))
    if match:
        return match.group(0)
    return None

def process_file(config):
    filepath = config['file']
    prefix = config['prefix']
    subtypes = config.get('subtypes', {})     # { "Всего": "_total" }
    filter_words = config.get('filter_keywords', []) # ["Декабрь"]

    print(f"Обработка {filepath}...")
    
    if not os.path.exists(filepath):
        print(f"  [!] Файл {filepath} не найден, пропускаем.")
        return {}

    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Результат: { "ОБЛАСТЬ АБАЙ": { "expenses_total_2023": 500, ... } }
    file_data = {}

    for item in data:
        # 1. Определяем регион
        raw_names = item.get('termNames', [])
        if not raw_names: continue
        
        # Обычно регион идет первым в списке termNames
        region_raw = raw_names[0]
        region_norm = normalize(region_raw)
        
        # 2. Определяем суффикс (тип местности и т.д.)
        # Проверяем, есть ли в termNames слова-маркеры (Всего, сельская...)
        suffix = ""
        if subtypes:
            found_subtype = False
            for term in raw_names:
                # Ищем точное или частичное совпадение
                for keyword, sfx in subtypes.items():
                    if keyword.lower() in str(term).lower():
                        suffix = sfx
                        found_subtype = True
                        break
                if found_subtype: break
            
            # Если у файла есть subtypes, но мы не нашли совпадения для этой записи — пропускаем её
            # (например, если там есть какая-то лишняя категория)
            if not found_subtype:
                continue

        # 3. Обрабатываем периоды (года)
        for p in item['periods']:
            # Фильтр (например, для преступности нужен только Декабрь)
            if filter_words:
                if not any(w in p['name'] for w in filter_words):
                    continue

            year = get_year_from_period(p)
            if year:
                # Формируем итоговый ключ: prefix + suffix + year
                # Пример: expenses + _rural + _2023 = expenses_rural_2023
                key = f"{prefix}{suffix}_{year}"
                try:
                    val = float(p['value'])
                    
                    if region_norm not in file_data:
                        file_data[region_norm] = {}
                    
                    # Сохраняем (перезаписываем, если дубль - берем последний, обычно самый свежий)
                    file_data[region_norm][key] = val
                except ValueError:
                    pass
    
    return file_data

def main():
    # 1. Загружаем все данные из JSON файлов в память
    master_data = {} # { "ОБЛАСТЬ АБАЙ": { "vrp_2023": 100, "crime_2023": 5 ... } }

    for conf in DATA_SOURCES:
        dataset = process_file(conf)
        
        # Объединяем с главными данными
        for region, metrics in dataset.items():
            if region not in master_data:
                master_data[region] = {}
            master_data[region].update(metrics)

    # 2. Открываем GeoJSON
    print(f"\nЧтение {GEOJSON_FILE}...")
    with open(GEOJSON_FILE, 'r', encoding='utf-8') as f:
        geojson = json.load(f)

    updated_count = 0
    
    # 3. Записываем данные в свойства полигонов
    for feature in geojson['features']:
        p = feature['properties']
        
        # Ищем имя региона
        geo_name = p.get('ADM_2_rus') or p.get('ADM1_EN') or p.get('name')
        if not geo_name: continue

        # Нормализуем и ищем соответствие в MAPPING
        norm_geo = normalize(geo_name)
        target_name = REGION_MAPPING.get(geo_name) or REGION_MAPPING.get(norm_geo) or norm_geo
        target_name = normalize(target_name)

        # Если нашли данные для этого региона — обновляем свойства
        if target_name in master_data:
            p.update(master_data[target_name])
            updated_count += 1
        else:
            print(f"  [?] Нет данных для региона: {geo_name} (искали как {target_name})")

    # 4. Сохраняем результат
    print(f"Сохранение в {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(geojson, f, ensure_ascii=False) # indent=2 можно убрать для компактности

    print(f"\nГотово! Обновлено регионов: {updated_count}")
    print("Пример новых полей: expenses_total_2023, expenses_rural_2023...")

if __name__ == "__main__":
    main()



























import json
import os

# --- НАСТРОЙКИ ---
GEOJSON_FILE = 'balance.geojson'
VRP_FILE = '2709379-vvp-metodom-proizvodstva.json'
CRIME_FILE = '704767-kolichestvo-prestupleniy.json'
OUTPUT_FILE = 'balance_timeseries.geojson'

# Словарь для исправления имен (тот же, что и раньше)
REGION_MAPPING = {
    "Abai Region": "ОБЛАСТЬ АБАЙ",
    "ОБЛАСТЬ АБАЙ": "ОБЛАСТЬ АБАЙ",
    
    "Jetisu Region": "ОБЛАСТЬ ЖЕТІСУ",
    "ОБЛАСТЬ ЖЕТІСУ": "ОБЛАСТЬ ЖЕТІСУ",
    
    "Ulytau Region": "ОБЛАСТЬ ҰЛЫТАУ",
    "ОБЛАСТЬ ҰЛЫТАУ": "ОБЛАСТЬ ҰЛЫТАУ",
    
    "Akmola Region": "АКМОЛИНСКАЯ ОБЛАСТЬ",
    "АКМОЛИНСКАЯ ОБЛАСТЬ": "АКМОЛИНСКАЯ ОБЛАСТЬ",
    
    "Aktobe Region": "АКТЮБИНСКАЯ ОБЛАСТЬ",
    "АКТЮБИНСКАЯ ОБЛАСТЬ": "АКТЮБИНСКАЯ ОБЛАСТЬ",
    
    "Almaty Region": "АЛМАТИНСКАЯ ОБЛАСТЬ",
    "АЛМАТИНСКАЯ ОБЛАСТЬ": "АЛМАТИНСКАЯ ОБЛАСТЬ",
    
    "Atyrau Region": "АТЫРАУСКАЯ ОБЛАСТЬ",
    "АТЫРАУСКАЯ ОБЛАСТЬ": "АТЫРАУСКАЯ ОБЛАСТЬ",
    
    "West Kazakhstan Region": "ЗАПАДНО-КАЗАХСТАНСКАЯ ОБЛАСТЬ",
    "ЗАПАДНО-КАЗАХСТАНСКАЯ ОБЛАСТЬ": "ЗАПАДНО-КАЗАХСТАНСКАЯ ОБЛАСТЬ",
    
    "Jambyl Region": "ЖАМБЫЛСКАЯ ОБЛАСТЬ",
    "ЖАМБЫЛСКАЯ ОБЛАСТЬ": "ЖАМБЫЛСКАЯ ОБЛАСТЬ",
    
    "Karaganda Region": "КАРАГАНДИНСКАЯ ОБЛАСТЬ",
    "КАРАГАНДИНСКАЯ ОБЛАСТЬ": "КАРАГАНДИНСКАЯ ОБЛАСТЬ",
    
    "Kostanay Region": "КОСТАНАЙСКАЯ ОБЛАСТЬ",
    "КОСТАНАЙСКАЯ ОБЛАСТЬ": "КОСТАНАЙСКАЯ ОБЛАСТЬ",
    
    "Kyzylorda Region": "КЫЗЫЛОРДИНСКАЯ ОБЛАСТЬ",
    "КЫЗЫЛОРДИНСКАЯ ОБЛАСТЬ": "КЫЗЫЛОРДИНСКАЯ ОБЛАСТЬ",
    
    "Mangystau Region": "МАНГИСТАУСКАЯ ОБЛАСТЬ",
    "МАНГИСТАУСКАЯ ОБЛАСТЬ": "МАНГИСТАУСКАЯ ОБЛАСТЬ",
    
    "Pavlodar Region": "ПАВЛОДАРСКАЯ ОБЛАСТЬ",
    "ПАВЛОДАРСКАЯ ОБЛАСТЬ": "ПАВЛОДАРСКАЯ ОБЛАСТЬ",
    
    "North Kazakhstan Region": "СЕВЕРО-КАЗАХСТАНСКАЯ ОБЛАСТЬ",
    "СЕВЕРО-КАЗАХСТАНСКАЯ ОБЛАСТЬ": "СЕВЕРО-КАЗАХСТАНСКАЯ ОБЛАСТЬ",
    
    "East Kazakhstan Region": "ВОСТОЧНО-КАЗАХСТАНСКАЯ ОБЛАСТЬ",
    "ВОСТОЧНО-КАЗАХСТАНСКАЯ ОБЛАСТЬ": "ВОСТОЧНО-КАЗАХСТАНСКАЯ ОБЛАСТЬ",
    
    "Turkistan Region": "ТУРКЕСТАНСКАЯ ОБЛАСТЬ",
    "ТУРКЕСТАНСКАЯ ОБЛАСТЬ": "ТУРКЕСТАНСКАЯ ОБЛАСТЬ",
    
    "Astana City": "Г.АСТАНА",
    "Г.АСТАНА": "Г.АСТАНА",
    "Astana": "Г.АСТАНА",
    
    "Almaty City": "Г.АЛМАТЫ",
    "Г.АЛМАТЫ": "Г.АЛМАТЫ",
    "Almaty": "Г.АЛМАТЫ",
    
    "Shymkent City": "Г.ШЫМКЕНТ",
    "Г.ШЫМКЕНТ": "Г.ШЫМКЕНТ",
    "Shymkent": "Г.ШЫМКЕНТ"
}

def normalize(text):
    return str(text).strip().upper() if text else ""

def process_periods(periods, prefix):
    """
    Превращает список периодов в словарь { "vrp_2023": 100, "vrp_2024": 200 }
    """
    result = {}
    for p in periods:
        # 1. Фильтр для Преступности (берем только итоги года - Декабрь)
        # Если это ВРП, там обычно просто "2023 год", но проверка не помешает
        if prefix == "crime" and "Декабрь" not in p['name']:
            continue

        try:
            # 2. Вытаскиваем год из даты "31.12.2023" -> "2023"
            date_str = p.get('date', '')
            if '.' in date_str:
                year = date_str.split('.')[-1]
            else:
                # Если даты нет, пробуем найти 4 цифры в названии
                import re
                match = re.search(r'\d{4}', p['name'])
                year = match.group(0) if match else None

            if year:
                # 3. Формируем ключ, например "vrp_2023"
                key = f"{prefix}_{year}"
                value = float(p['value'])
                result[key] = value
        except Exception:
            continue
            
    return result

def load_data_map(filepath, prefix):
    print(f"Обработка {filepath} ({prefix})...")
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Структура: { "ОБЛАСТЬ АБАЙ": { "vrp_2020": 10, "vrp_2021": 20 } }
    master_dict = {}
    
    for item in data:
        raw_name = item['termNames'][0]
        norm_name = normalize(raw_name)
        
        # Получаем все года для этого региона
        time_series = process_periods(item['periods'], prefix)
        master_dict[norm_name] = time_series
        
    return master_dict

def main():
    # 1. Грузим данные в память
    vrp_map = load_data_map(VRP_FILE, "vrp")         # Будет vrp_2023, vrp_2024...
    crime_map = load_data_map(CRIME_FILE, "crime")   # Будет crime_2023, crime_2024...
    
    # 2. Открываем GeoJSON
    with open(GEOJSON_FILE, 'r', encoding='utf-8') as f:
        geojson = json.load(f)
        
    print(f"Объединение данных с {GEOJSON_FILE}...")
    
    # 3. Записываем данные
    for feature in geojson['features']:
        p = feature['properties']
        
        # Определяем имя
        geo_name = p.get('ADM_2_rus') or p.get('ADM1_EN') or p.get('name')
        target_name = REGION_MAPPING.get(geo_name) or REGION_MAPPING.get(normalize(geo_name)) or normalize(geo_name)
        target_name = normalize(target_name)
        
        # Вставляем ВРП (все года сразу)
        if target_name in vrp_map:
            p.update(vrp_map[target_name]) # Добавляет vrp_2020, vrp_2021 и т.д.
            
        # Вставляем Преступность
        if target_name in crime_map:
            p.update(crime_map[target_name])

    # 4. Сохраняем
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(geojson, f, ensure_ascii=False) # Убрал indent для уменьшения веса файла
    
    print(f"Готово! Файл сохранен как {OUTPUT_FILE}")
    print("Пример полей в GeoJSON: vrp_2023, vrp_2024, crime_2023...")

if __name__ == "__main__":
    main()