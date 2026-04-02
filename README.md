```

░██████╗░███████╗██╗░░░░░██╗░██████╗████████╗██╗██████╗░██╗██╗░░░░░██╗██╗░░░██╗░█████╗░██████╗░░░░░░░░░░
██╔════╝░██╔════╝██║░░░░░██║██╔════╝╚══██╔══╝██║██╔══██╗██║██║░░░░░██║╚██╗░██╔╝██╔══██╗██╔══██╗░░░░░░░░░
██║░░██╗░█████╗░░██║░░░░░██║╚█████╗░░░░██║░░░██║██████╔╝██║██║░░░░░██║░╚████╔╝░██║░░██║██████╔╝░░░░░░░░░
██║░░╚██╗██╔══╝░░██║░░░░░██║░╚═══██╗░░░██║░░░██║██╔══██╗██║██║░░░░░██║░░╚██╔╝░░██║░░██║██╔══██╗░░░░░░░░░
╚██████╔╝███████╗███████╗██║██████╔╝░░░██║░░░██║██║░░██║██║███████╗██║░░░██║░░░╚█████╔╝██║░░██║██╗██╗██╗
░╚═════╝░╚══════╝╚══════╝╚═╝╚═════╝░░░░╚═╝░░░╚═╝╚═╝░░╚═╝╚═╝╚══════╝╚═╝░░░╚═╝░░░░╚════╝░╚═╝░░╚═╝╚═╝╚═╝╚═╝
```
# 🌕 AYAP

![AYAP Architecture](https://img.shields.io/badge/Status-Active-brightgreen.svg) ![Tech Stack](https://img.shields.io/badge/Stack-Python_|_Flask_|_Three.js-blue.svg) ![Algorithm](https://img.shields.io/badge/Algorithm-D*_Lite_+_APF-orange.svg)

## 1. PROJE ÖZETİ VE AMACI
Türkiye’nin Ay Araştırma Programı (AYAP) kapsamında gönderilmesi planlanan uzay aracının (Rover) zorlu ay topografyasında (kraterler, yüksek eğimler, regolit zemin) Dünya ile olan sinyal gecikmesi (yaklaşık 2.5 sn) nedeniyle insan müdahalesi olmadan ilerlemesi gerekmektedir. 

Bu simülasyon projesi; **Tam Otonom Karar Mekanizması**, **NASA DEM Haritalandırılması**, ve **Dinamik Rota Planlama** teknolojilerini bir araya getirerek uzay araçları için risk odaklı (risk-aware) bir navigasyon altyapısı sunar.

---

## 2. TEMEL ÖZELLİKLER VE TEKNOLOJİLER

### 🌍 NASA LROC WMS DEM Entegrasyonu
Procedural (rastgele) harita üretiminin yanı sıra sistem, verilen koordinatlarda **NASA LROC** (Lunar Reconnaissance Orbiter Camera) WMS API'sini kullanarak Ay'ın gerçek Sayısal Yükseklik Modellerini (Digital Elevation Model - DEM) sisteme dinamik olarak indirir ve haritaya işler.

### 🧠 D* Lite ve Yapay Potansiyel Alanlar (APF)
Navigasyon sadece en kısa yolu değil, en "güvenli" yolu bulur:
- **Heuristic ve Maliyet (Cost) Fonksiyonları:** Eğim ($\alpha$), Zemin Pürüzlülüğü ve Octile mesafe ölçümleriyle rotalar optimize edilir.
- **Yapay Potansiyel Alanlar (APF):** Haritadaki engeller rover'ı fiziksel olarak iten (repulsive) bir güç olarak değerlendirilir.
- **Dinamik Replanning:** Araç ilerlerken yeni bir bilinmeyen tehlike tespit edildiğinde (SLAM/Lidar), D* Lite mimarisi sayesinde saniyenin onda biri sürede tüm güzergah baştan hesaplanır.

### 🏎️ 3D WebGL Render Sürücüsü (Three.js)
Basit 2D grid haritalarının ötesine geçerek; dinamik aydınlatma mekanikleri, kamera açıları (OrbitControls), FPS takip görselleştirmesi, yumuşak ışık gölgeleri ve Düşük-Poligon (Low-Poly) estetiği ile tüm otonom operasyonlar profesyonel **Three.js** motoru ile 3B uzayda simüle edilmektedir.

### 📸 Sensör Füzyonu & Genişletilmiş Kalman Filtresi (EKF) Modeli
Stereo kameralar, 3D LiDAR ve IMU verilerinden alınan değerler birleştirilerek hatalı ölçümler absorbe edilir. Görüntü Kalite İndeksi (IQI) regolit tozu yüzünden düştüğünde sistem görsel odometriden LiDAR SLAM vektörlerine otonom olarak geçiş yapar. Bekker-Wong teorisine dayanarak aracın kuma batma riski (Sinkage) anlık izlenir.

---

## 3. KURULUM VE ÇALIŞTIRMA

Gereksinimler: **Python 3.12+**

1. Repoyu bilgisayarınıza indirin veya klonlayın.
2. Gerekli Python bağımlılıklarını kurun:
   ```bash
   pip install -r requirements.txt
   # Not: requirements.txt bulunmuyorsa 'pip install Flask' yeterlidir.
   ```
3. Lokal Flask sunucusunu başlatın:
   ```bash
   python app.py
   ```
4. Tarayıcınızda [http://localhost:5000](http://localhost:5000) adresine giderek AYAP Görev Kontrol Merkezine giriş yapın.

---
