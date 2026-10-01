# IRON LOG

`index.html` dosyasını Chrome veya Safari'de aç. Kurulum, framework, sunucu veya internet bağlantısı gerekmez. Eski `iron-log.html` dosyası korunmuştur.

## Kullanım

- **Today:** Bugünkü öneriyi veya aşağıdaki programlardan istediğini başlat. Öneri hiçbir programı engellemez. Her giriş anında kaydedilir; sayfayı yeniden açınca aktif antrenman devam eder. Tamamlanmış setleri tekrar açıp düzenleyebilirsin.
- **History:** Geçmişi incele, düzenle, set ekle/sil veya tarih seçerek manuel antrenman oluştur. Manuel kayıtlar tamamlanana kadar taslak kalır.
- **Templates / Exercises:** Programları ve hareket kütüphanesini yönet. Programdaki set sayısı ve hedef metni ayrı düzenlenir. Hedef metnini değiştirirken set sayısını da kontrol et.
- **Data:** Tam JSON yedeği al, yedeği doğrulama ve onay sonrasında yükle veya tarih aralığına göre TXT antrenör raporu indir. İçe aktarma tüm mevcut veriyi değiştirir; birleştirme yapılmaz.

Süreler **saniye**, mesafeler **metre**, ağırlık/destek **kg** cinsindedir. Kardiyoda süre veya mesafeden birini girmek yeterlidir. Önceki performansta aynı hareket kimliğinin tamamlanmış son antrenmanındaki tamamlanmış setleri gösterilir. Geçmiş bir kayıtta bakılıyorsa bu kayıttan sonraki antrenmanlar kullanılmaz.

## Veri modeli ve depolama

Tek anahtar: `iron-log-state`.

```text
{
  version: 2,
  exercises: [{ id, name, icon, type, defaultSets, minReps, maxReps, notes }],
  templates: [{ id, name, muscleGroups, intensity, exercises: [{ id, exerciseId, sets, target }] }],
  sessions: [{
    id, templateId, templateName, date, startedAt, completedAt, status, notes,
    muscleGroups, intensity, // yeni session snapshot’ları
    results: [{ id, exerciseId, exercise: snapshot, target, notes, sets }]
  }],
  settings: { activeSessionId, seededPrograms }
}
```

Set: `{ id, weight, assistance, reps, duration, distance, done }`. Girilmemiş ölçümler `null` olarak tutulur. Session durumu `active`, `draft` veya `completed` olabilir. `date` yerel takvim günüdür; zaman damgaları ISO biçiminde saklanıp yerel saatle gösterilir. Manuel başlangıç saati bilinmiyorsa `null` kalır; bitiş saati belirtilmezse kayıt sırasında seçilen güne atanır.

Bir session başlatılırken hareket tanımları, program adı, hedefler, kas grupları, yoğunluk ve set sayıları derin kopyalanır. Kütüphane veya program değişiklikleri aktif ve geçmiş session'ları etkilemez. Boş ilk açılışta A/B, altı yeni hazır program ve kütüphane oluşturulur; örnek geçmiş eklenmez.

Tüm localStorage erişimleri `Storage` API'sinde toplanır. `validateData()` iç içe alanları, sürümü, sayısal değerleri, kimlikleri ve aktif session bağlantısını doğrular. Bozuk veri otomatik sıfırlanmaz; depolama hatası ekranda bildirilir. Kaydetme başarısız olursa bellekteki güncel veriyi JSON olarak indirebilirsin.

### V1 → V2 güncellemesi

Mevcut veri önce doğrulanır, ardından bir kopyası üzerinde eklemeli migration yapılır. `iron-log-state` anahtarı aynı kalır. Session dizisi, eski snapshot’lar, kullanıcı hareketleri ve program içerikleri değişmez; mevcut programlara eksik kas grubu / yoğunluk alanları eklenir. V1 ve V2 JSON yedekleri içe aktarılabilir.

Hazır programlar: **Sırt + Biceps**, **Göğüs + Omuz + Triceps**, **Bacak**, **Bacak + Göğüs**, **Full Body**, **🔥 HARD MODE**. A/B programları korunur. Sabit hareket ID’leri önceliklidir; eşdeğer adlar da eşleştirilir (örneğin Şınav / Push-up, Pec Deck / Chest Fly). Eşleşen kullanıcı hareketinin alanları değiştirilmez; yeni program o hareketin mevcut ID’sini kullanır. Dumbbell ve makine varyasyonları ayrı hareketlerdir.

`settings.seededPrograms` eklenen / eşleştirilen katalog kayıtlarını izler. Sonraki açılışlarda seed tekrarlanmaz; kullanıcının sonradan sildiği hazır program veya alternatif ekipman tekrar oluşturulmaz. Dip program düzenleyicisinden kaldırılabilir. Alternatifli ısınma ve kardiyoda Rowing/Treadmill varsayılandır; Templates ekranından Stationary Bike/Elliptical ile değiştirilebilir.

### Eski tek günlük kayıtlar

Aynı depolama alanında erişilebilen `ironlog_YYYY-MM-DD_A/B` kayıtları ilk yüklemede aktarılır. Eski uygulamada tür ve birim bilgisi belirsiz olan süre/mesafe girişleri özgün haliyle notlara ve `legacySource` alanına alınır; tamamlanmamış kayıtlar taslak olur. Eski anahtarlar silinmez.

Tarayıcılar `file://` dosyalarının localStorage alanını dosya yoluna göre ayırabilir. Bu nedenle farklı dosya adı, tarayıcı veya cihazdaki eski kayıtlar otomatik görünmeyebilir. Güncel uygulamayı aynı dosya yolunda kullan; taşıma için JSON yedeği al. Gizli gezinme ve tarayıcı verilerini temizleme kalıcılığı etkiler.

## Bugünkü antrenman önerisi

Öneri tamamen yerel, deterministik bir puanlamadır; template adlarını kullanmaz. Yeni programlarda ve düzenleyicide `muscleGroups: { primary: [], secondary: [] }` ile `intensity: "normal" | "hard"` bulunur. Yeni session bu metadata’yı kopyalar. Metadata bulunmayan eski session’lar yalnızca kendi tamamlanmış hareket snapshot’larından sınıflandırılır; değişmiş/silinmiş güncel programlara bakılmaz ve geçmişe yeni alan yazılmaz. Tanınmayan eski özel hareketler için kas grubu tahmini yapılmaz; eski kayıtta bilinmeyen yoğunluk normal kabul edilir.

Puan, ihmal edilen kas grubu bonusunu artırır; yakın tarihli çalışma, birikmiş yük ve yakın antrenmanlarda üst üste aynı ana kas grubunun tekrarı puanı düşürür. Yük ve toparlanma etkisi tamamlanan set / tüm set oranıyla ölçeklenir. Yakın iki yoğun antrenmanda aynı ana kas tekrar etmişse streak cezası uygulanır. Bir kasın yakın zamanda çalışılmasını diğer dinlenmiş ana kaslar gizlemesin diye toparlanma cezasının %75’i en yüksek ana kas cezasından, %25’i ortalamadan gelir.

Gün farkları session’ın **yerel takvim tarihi** üzerinden hesaplanır; yaz/kış saati geçişlerinden etkilenmez. Yedi gün ve öncesindeki yük, toparlanma ve streak cezaları sıfırdır. Boş, aktif, taslak ve gelecekteki session’lar ana geçmişe girmez. %25’in altındaki tamamlanma oranları az miktarda yük üretir ama son anlamlı antrenman / uzun ara kararını değiştirmez; streak için en az %50 aranır.

Geçmiş yoksa veya en az 10 günlük ara varsa normal, dengeli tüm-vücut programına bonus verilir. Hard Mode daha yüksek yük ve ek puan cezası taşır. Pazar bonusu yalnızca çok düşük yakın dönem yükünde uygulanır. Tüm seçenekler düşük puan alsa da sonuç bunların göreli sıralamasıdır; hiçbir program devre dışı bırakılmaz. UI en fazla üç kısa gerekçe gösterir.

### Ayarlanabilir sabitler

`index.html` içindeki **RECOMMENDATION CONSTANTS** bölümünde:

```js
RECOVERY_PENALTIES = { 0: 100, 1: 70, 2: 40, 3: 20, 4: 5, 5: 2, 6: 1 };
LOAD_DECAY = { 0: 1, 1: 1, 2: 0.6, 3: 0.35, 4: 0.15, 5: 0.08, 6: 0.03 };
NEGLECT_BONUSES = { 0: 0, 2: 3, 4: 10, 7: 20, 10: 28, 14: 32 };
PRIMARY_MUSCLE_WEIGHT = 3;
SECONDARY_MUSCLE_WEIGHT = 1;
HARD_MODE_MULTIPLIER = 1.5;
SUNDAY_HARD_MODE_BONUS = 3;
STREAK_PENALTY = 30;
```

Diğer puan katsayıları ve eşikler aynı bölümdeki `RECOMMENDATION_CONFIG` nesnesindedir. `getWorkoutRecommendation()` `{ templateId, score, reasons }` döndürür; çalıştırılabilecek program yoksa `null` döner. Puanlar yüzde veya tıbbi iyileşme ölçüsü değildir.

Geliştirici konsolunda `IronLogDebug.recommendation()` çalıştırarak tüm programların puanını ve katkılarını görebilirsin. Bu salt-okunur çağrı verileri değiştirmez; üretim ekranında puan tablosu gösterilmez.

## Kodun genişletilmesi

Kod DATA, STORAGE, SESSION LOGIC, TEMPLATE LOGIC, HISTORY, IMPORT EXPORT, UI ve EVENT HANDLERS bölümlerine ayrılır. Başlıca fonksiyonlar:

- `createSession()`, `previousResult()`, `progress()`: snapshot, son performans ve ilerleme.
- `Storage.getState() / saveState() / exportData() / importData()`: kalıcılık ve yedekler.
- `renderHome()`, `renderWorkout()`, `renderHistory()`, `renderSessionDetails()`, `renderTemplates()`, `renderExercises()`, `renderDataPage()`: ekranlar.
- `coachReport()`: insan tarafından okunabilir rapor.
- `migrateData()`: gelecekteki sürüm geçişleri için giriş noktası.

Yeni hareket türleri için `TYPES`, `FIELDS`, `formatSet()` ve doğrulama kurallarını genişlet. Veri yapısı değişirse `VERSION` artırılıp `migrateData()` içine eski sürüm dönüşümü eklenebilir. Uygulama kodu daha sonra bu bölümlere göre ayrı JS/CSS dosyalarına taşınabilir.

## Testler

`tests/iron-log.test.cjs` Playwright ile geçici, izole bir Chrome profili kullanır. Kullanıcının gerçek tarayıcı verilerini değiştirmez. Playwright test aracıdır; uygulamanın çalışma bağımlılığı yoktur.

```sh
node tests/recommendation.test.cjs
node tests/iron-log.test.cjs
```

Playwright farklı bir konuma kuruluysa `NODE_PATH` ile paket dizinini belirt. İndirilmiş WebKit motoruyla aynı paketi çalıştırmak için `TEST_WEBKIT=1` kullan.

Chrome test kapsamı: ilk seed, boş geçmiş, autosave, refresh, destek ölçümü, previous performance, tamamlama, snapshot izolasyonu, geçmiş düzenleme/set ekleme/silme, manuel kayıt, silme onayı, program sıralama, hareket oluşturma, JSON round-trip, hatalı yedek reddi, rapor indirme, bozuk storage ve eski sürüm aktarımı. Safari ile gerçek cihaz testi ayrıca yapılmalıdır.

Öneri testleri istenen sekiz senaryoyu, boş/kısmi/taslak/gelecek kayıtları, uzun arayı, metadata snapshot izolasyonunu, V1 migration’ını, eşdeğer hareketlerin yeniden kullanımını, silinen programların geri gelmemesini ve 20 yeniden açılışı kapsar. Node puanlama/migration testleri ek paket gerektirmez.
