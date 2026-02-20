import random
import math
import zipfile
import csv

# Major cities in KSA (Lat, Lon, Weight, Code)
CITIES = [
    (24.7136, 46.6753, 30, 'RIY'), # Riyadh
    (21.4858, 39.1925, 20, 'JED'), # Jeddah
    (21.3891, 39.8579, 15, 'MEC'), # Mecca
    (24.5247, 39.5692, 10, 'MED'), # Medina
    (26.4207, 50.0888, 15, 'DAM'), # Dammam/Khobar
    (18.2164, 42.5053, 5,  'ABH'), # Abha
    (27.5109, 41.7208, 5,  'HAI'), # Hail
]

def generate_point_around(lat, lon, radius_km):
    r = radius_km / 111.32 # Approx degrees
    u = random.random()
    v = random.random()
    w = r * math.sqrt(u)
    t = 2 * math.pi * v
    x = w * math.cos(t)
    y = w * math.sin(t)
    return lat + x, lon + y

def generate_kmz(filename, count):
    print(f"Generating {count} points for {filename}...")
    kml_content = []
    kml_content.append('<?xml version="1.0" encoding="UTF-8"?>')
    kml_content.append('<kml xmlns="http://www.opengis.net/kml/2.2">')
    kml_content.append('<Document>')
    
    # City-specific counters
    counters = {city[3]: 1 for city in CITIES}
    generated_points = []
    
    for i in range(count):
        # Pick a city based on weights
        city = random.choices(CITIES, weights=[c[2] for c in CITIES])[0]
        code = city[3]
        
        # Generate point within ~50km of city center, or sometimes spread out
        if random.random() < 0.8:
            lat, lon = generate_point_around(city[0], city[1], 50)
        else:
            # Random spread across KSA (rough box)
            lat = random.uniform(16.0, 32.0)
            lon = random.uniform(35.0, 55.0)
            
        # Generate Site ID (e.g., RIY0001)
        site_id = f"{code}{counters[code]:04d}"
        counters[code] += 1
        
        kml_content.append('<Placemark>')
        kml_content.append(f'<name>{site_id}</name>')
        kml_content.append(f'<Point><coordinates>{lon},{lat}</coordinates></Point>')
        kml_content.append('</Placemark>')
        
        # Store for potential export
        generated_points.append({'SiteID': site_id, 'Latitude': lat, 'Longitude': lon, 'CityCode': code})
        
    kml_content.append('</Document>')
    kml_content.append('</kml>')
    
    kml_str = '\n'.join(kml_content)
    
    with zipfile.ZipFile(filename, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('doc.kml', kml_str)
        
    print(f"Saved {filename}")
    return generated_points

def export_random_subset(points, filename, count):
    if len(points) < count:
        print(f"Warning: requested {count} points but only have {len(points)}. Exporting all.")
        subset = points
    else:
        subset = random.sample(points, count)
        
    print(f"Exporting {len(subset)} random sites to {filename}...")
    with open(filename, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['SiteID', 'Latitude', 'Longitude', 'CityCode'])
        writer.writeheader()
        writer.writerows(subset)
    print(f"Saved {filename}")

if __name__ == "__main__":
    _ = generate_kmz("saudi_10k.kmz", 10000)
    points_20k = generate_kmz("saudi_20k.kmz", 20000)
    
    # Export 1205 random sites from the 20k dataset
    export_random_subset(points_20k, "random_audit_sites.csv", 1205)
