import json
import os
import re

# --- НАСТРОЙКИ ---
GEOJSON_FILE = 'balance.geojson'
POPULATION_FILE = '703831-naselenie.json'
OUTPUT_FILE = 'balance_updated.geojson'

# Словарь для исправления названий регионов
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

def get_year(period):
    """Извлекает год из даты (31.12.2023) или названия"""
    date_str = period.get('date', '')
    if '.' in date_str:
        return date_str.split('.')[-1]
    match = re.search(r'\d{4}', period.get('name', ''))
    return match.group(0) if match else None

def main():
    print(f"Загрузка {POPULATION_FILE}...")
    with open(POPULATION_FILE, 'r', encoding='utf-8') as f:
        pop_data = json.load(f)

    # Словарь для накопления данных: { "ОБЛАСТЬ АБАЙ": { "popul_total_2023": 100, "popul_male_2023": 40 ... } }
    master_data = {}

    for item in pop_data:
        # Структура termNames: [Регион, Тип местности, Пол, Возраст]
        # Нам нужны:
        # Index 1 (Тип местности) == "Всего" (не делим на город/село)
        # Index 3 (Возраст) == "Все группы"
        
        terms = item.get('termNames', [])
        if len(terms) < 4: continue
        
        region_raw = terms[0]
        area_type = terms[1]
        gender = terms[2]
        age_group = terms[3]

        # Фильтры
        if area_type != "Всего": continue
        if age_group != "Все группы": continue

        # Определяем префикс поля в зависимости от пола
        prefix = ""
        if gender == "Всего":
            prefix = "popul_total"
        elif gender == "Мужской":
            prefix = "popul_male"
        elif gender == "Женский":
            prefix = "popul_female"
        else:
            continue # Пропускаем другие варианты, если они есть

        # Нормализуем имя региона для поиска
        norm_region = normalize(region_raw)
        if norm_region not in master_data:
            master_data[norm_region] = {}

        # Проходим по годам
        for p in item.get('periods', []):
            year = get_year(p)
            if year:
                try:
                    val = float(p['value'])
                    key = f"{prefix}_{year}" # например popul_total_2023
                    master_data[norm_region][key] = val
                except ValueError:
                    pass

    print(f"Данные обработаны для {len(master_data)} регионов.")

    # --- ОБНОВЛЕНИЕ GEOJSON ---
    print(f"Чтение {GEOJSON_FILE}...")
    with open(GEOJSON_FILE, 'r', encoding='utf-8') as f:
        geojson = json.load(f)

    updated_count = 0
    for feature in geojson['features']:
        p = feature['properties']
        
        # Определяем имя региона в GeoJSON
        geo_name = p.get('ADM_2_rus') or p.get('ADM1_EN') or p.get('name')
        
        # Ищем соответствие в нашем словаре данных
        target_name = REGION_MAPPING.get(geo_name) or REGION_MAPPING.get(normalize(geo_name))
        if not target_name: target_name = normalize(geo_name)
        
        target_name = normalize(target_name)

        if target_name in master_data:
            # Обновляем свойства полигона новыми полями
            p.update(master_data[target_name])
            updated_count += 1
        else:
            print(f"  [!] Нет данных населения для: {geo_name}")

    print(f"Сохранение в {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(geojson, f, ensure_ascii=False)

    print(f"Готово! Обновлено регионов: {updated_count}")
    print("Примеры новых полей: popul_total_2023, popul_male_2023, popul_female_2023")

if __name__ == "__main__":
    main()