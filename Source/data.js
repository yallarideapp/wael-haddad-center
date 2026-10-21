/* Wael Haddad Center — shipped content.
   Real facts come from the owner's Facebook page (see Documents/SOURCES.md).
   Everything under `sample` is demo data and is labelled as a sample on the site. */
window.WH_DEFAULTS = {
  version: 1,
  /* 'demo': portable demo with sample cars and the browser-only admin.
     'live': the Phase 1 public site (services, booking by WhatsApp, symptoms, contact). The package script sets it for the Hostinger ZIP. */
  mode: 'demo',

  settings: {
    nameAr: 'مركز وائل حداد',
    nameEn: 'Wael Haddad Center',
    taglineAr: 'لصيانة المركبات الألمانية',
    taglineEn: 'German car service',
    sloganAr: 'خبرة ألمانية .. أداء موثوق',
    sloganEn: 'German expertise. Reliable performance.',
    phones: ['0795866455', '0790984614'],
    whatsapp: '0795866455',
    addressAr: 'البيادر، المنطقة الصناعية، مقابل أدوية الحكمة، عمّان',
    addressEn: 'Al-Bayader Industrial Area, opposite Hikma Pharmaceuticals, Amman',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Hikma Pharmaceuticals Al Bayader Wadi Al Seer Amman'),
    since: 1989,
    hoursAr: '',
    hoursEn: '',
    reviewUrl: '',
    oilIntervalKm: 10000,
    offer: {
      on: true,
      titleAr: 'فحص مجاني لفصل الشتاء',
      titleEn: 'Free winter check',
      textAr: 'وخصومات 30% على قطع الغيار والزيوت والبريكات والمساحات',
      textEn: 'plus 30% off spare parts, oils, brakes and wipers'
    }
  },

  /* Brands named in the shop's posts. Shown as text only. */
  brands: ['Audi', 'Volkswagen', 'Porsche', 'Bentley', 'Lamborghini'],

  services: [
    { id: 'oil', icon: 'oil', nameAr: 'زيوت وفلاتر أصلية', nameEn: 'Genuine oils & filters',
      descAr: 'تغيير زيت وفلاتر بالمواصفات المطلوبة لسيارتك.', descEn: 'Oil and filter changes to your car’s specification.', price: null, hidden: false },
    { id: 'service', icon: 'service', nameAr: 'صيانة دورية', nameEn: 'Scheduled maintenance',
      descAr: 'صيانة حسب الكيلومترات وجدول الشركة.', descEn: 'Service by mileage and the maker’s schedule.', price: null, hidden: false },
    { id: 'mechanic', icon: 'mechanic', nameAr: 'ميكانيك وتشخيص', nameEn: 'Mechanical repair & diagnosis',
      descAr: 'فحص الأعطال الميكانيكية وتصليحها.', descEn: 'Finding and fixing mechanical faults.', price: null, hidden: false },
    { id: 'electric', icon: 'electric', nameAr: 'كهرباء سيارات', nameEn: 'Auto electrics',
      descAr: 'فحص وتصليح أعطال الكهرباء بالسيارة.', descEn: 'Electrical fault finding and repair.', price: null, hidden: false },
    { id: 'brakes', icon: 'brakes', nameAr: 'بريكات', nameEn: 'Brakes',
      descAr: 'فحص وتغيير الفحمات والديسكات.', descEn: 'Pad and disc inspection and replacement.', price: null, hidden: false },
    { id: 'parts', icon: 'parts', nameAr: 'قطع غيار', nameEn: 'Spare parts',
      descAr: 'قطع لأودي وفولكس فاجن وبورش.', descEn: 'Parts for Audi, Volkswagen and Porsche.', price: null, hidden: false },
    { id: 'winter', icon: 'winter', nameAr: 'فحص الشتاء', nameEn: 'Winter check',
      descAr: 'فحص قبل البرد والشتوة. مجاني هالفترة.', descEn: 'A check before the cold and rain. Free for now.', price: 0, hidden: false }
  ],

  /* General guidance only. Shown with a line saying it is not a diagnosis. */
  symptoms: [
    { id: 'brakes', level: 'soon', ar: 'تصفير أو احتكاك وقت البريك', en: 'Squeal or grinding when braking',
      adviceAr: 'غالباً الفحمات قرّبت تخلص. لا تأجّلها كثير، لأنها إذا خلصت بتخرّب الديسك وبتصير الكلفة أعلى.',
      adviceEn: 'Usually worn pads. Don’t leave it long: once they’re gone they damage the discs and the bill grows.' },
    { id: 'engine-light', level: 'soon', ar: 'لمبة المحرك ضاوية', en: 'Check-engine light is on',
      adviceAr: 'إذا ثابتة: احجز فحص كمبيوتر هالأسبوع. إذا بترمش أو السيارة بتنتع: خفّف السرعة ووقّف بمكان آمن واتصل فينا.',
      adviceEn: 'Steady: book a scan this week. Flashing, or the car is misfiring: slow down, stop somewhere safe and call us.' },
    { id: 'overheat', level: 'stop', ar: 'حرارة المحرك طالعة', en: 'Engine is overheating',
      adviceAr: 'وقّف السيارة وطفّيها. لا تفتح غطا الرديتر وهي سخنة. اتصل فينا قبل ما تكمّل سواقة.',
      adviceEn: 'Pull over and switch off. Never open the radiator cap while it’s hot. Call us before driving on.' },
    { id: 'oil-light', level: 'stop', ar: 'لمبة الزيت حمرا', en: 'Red oil-pressure light',
      adviceAr: 'وقّف المحرك بأسرع وقت آمن. السواقة مع هاي اللمبة ممكن تخرّب المحرك.',
      adviceEn: 'Stop the engine as soon as it’s safe. Driving with this light on can wreck the engine.' },
    { id: 'heater', level: 'soon', ar: 'التدفئة ما بتدفّي', en: 'Heater blowing cold',
      adviceAr: 'ممكن تكون من مستوى ماء الرديتر أو الثرموستات أو الدفّاية. احجز فحص قبل البرد.',
      adviceEn: 'Often coolant level, the thermostat or the heater core. Book a check before the cold sets in.' },
    { id: 'battery', level: 'soon', ar: 'السيارة بتتعب لتشتغل الصبح', en: 'Hard to start in the morning',
      adviceAr: 'البطارية بتضعف بالبرد. فحص البطارية والدينمو بياخذ دقايق.',
      adviceEn: 'Batteries weaken in the cold. Testing the battery and alternator takes minutes.' },
    { id: 'gearbox', level: 'soon', ar: 'نتعة أو تأخير بالجير', en: 'Jerky or late gear changes',
      adviceAr: 'احجز فحص قريب. كل ما بكّرت، كل ما كان التصليح أبسط.',
      adviceEn: 'Book a check soon. The earlier it’s seen, the simpler the fix.' },
    { id: 'vibration', level: 'soon', ar: 'رجفة على السرعات العالية', en: 'Vibration at high speed',
      adviceAr: 'غالباً من الجنوط أو الترصيص أو الديسكات. خفّف السرعة لحد ما نفحصها.',
      adviceEn: 'Usually wheels, balancing or discs. Keep the speed down until it’s checked.' },
    { id: 'smell', level: 'stop', ar: 'ريحة حرق أو دخان', en: 'Burning smell or smoke',
      adviceAr: 'وقّف بمكان آمن، طفّي السيارة وابعد عنها، واتصل فينا.',
      adviceEn: 'Stop somewhere safe, switch off, step away from the car and call us.' },
    { id: 'due', level: 'ok', ar: 'بدها صيانة دورية بس', en: 'Just due for a service',
      adviceAr: 'ما في استعجال. احجز بالوقت اللي بناسبك.',
      adviceEn: 'No rush. Book whenever suits you.' }
  ],

  stages: [
    { id: 'in', ar: 'استلمنا السيارة', en: 'Checked in' },
    { id: 'lift', ar: 'على الرافعة: فحص', en: 'On the lift: inspection' },
    { id: 'approval', ar: 'بانتظار موافقتك', en: 'Waiting for your OK' },
    { id: 'parts', ar: 'بانتظار القطع', en: 'Waiting for parts' },
    { id: 'repair', ar: 'قيد التصليح', en: 'In repair' },
    { id: 'qc', ar: 'فحص نهائي', en: 'Final check' },
    { id: 'ready', ar: 'جاهزة للاستلام', en: 'Ready for pickup' }
  ],

  /* Customer comments on the owner's Facebook posts, word for word. */
  quotes: [
    { text: 'بكفي المصدقيه الله يباركلكم. معلمين على الأصول. المهندس ابو ربيع والمهندس ربيع فخامه', who: 'رياض خ.' },
    { text: 'ما شاء الله تبارك الرحمن مهندس وائل حداد الفخامه على الاصول', who: 'عثمان ف.' },
    { text: 'اشهد انك معلم مع كل الاحترام والتقدير', who: 'أمين ب.' }
  ],

  /* ---------- Demo data (labelled "sample" everywhere it shows) ---------- */
  sample: {
    jobs: [
      { id: 'J1024', plate: '12-34567', car: { brand: 'Audi', model: 'A6', year: 2016 }, km: 148300,
        customer: { name: 'زبون تجريبي', phone: '0791234567' }, stage: 'approval', etaAr: 'اليوم قبل الساعة 5', etaEn: 'Today before 5 pm',
        log: [['in', 190], ['lift', 160], ['approval', 35]],
        findings: [
          { id: 'f1', illus: 'leak', urgency: 'soon',
            titleAr: 'تهريب زيت من جوان غطاء البلوف', titleEn: 'Oil leak at the valve-cover gasket',
            noteAr: 'الزيت نازل على جنب المحرك. إذا ضل، بنقص الزيت وبتطلع ريحة حرق.', noteEn: 'Oil is running down the side of the engine. Left alone, the level drops and it smells of burning.',
            tiers: { genuine: 85, commercial: 55 }, choice: 'genuine', status: 'pending' },
          { id: 'f2', illus: 'brake', urgency: 'soon',
            titleAr: 'فحمات البريك القدامية 3 ملم', titleEn: 'Front brake pads at 3 mm',
            noteAr: 'الحد الأدنى تقريباً 3 ملم. بننصح تتغير هلأ قبل ما توصل للديسك.', noteEn: 'About 3 mm is the minimum. We advise replacing them now, before they reach the discs.',
            tiers: { genuine: 70, commercial: 42 }, choice: 'genuine', status: 'pending' },
          { id: 'f3', illus: 'wiper', urgency: 'ok',
            titleAr: 'مساحات قدام مهترية', titleEn: 'Worn front wipers',
            noteAr: 'بتخطّط على القزاز. مش مستعجلة، بس الشتوة قرّبت.', noteEn: 'They streak the glass. Not urgent, but the rain is coming.',
            tiers: { genuine: 28, commercial: 14 }, choice: 'commercial', status: 'pending' }
        ] },
      { id: 'J1025', plate: '30-11223', car: { brand: 'Volkswagen', model: 'Tiguan', year: 2019 }, km: 87400,
        customer: { name: 'زبون تجريبي 2', phone: '0781112233' }, stage: 'parts', etaAr: 'بكرا الظهر', etaEn: 'Tomorrow at noon',
        log: [['in', 1500], ['lift', 1440], ['approval', 1380], ['parts', 1320]],
        findings: [
          { id: 'f1', illus: 'sensor', urgency: 'soon',
            titleAr: 'حساس حرارة المحرك', titleEn: 'Coolant temperature sensor',
            noteAr: 'قراءته غلط، وهو السبب إنه لمبة المحرك ضاوية.', noteEn: 'It reads wrong, which is why the engine light is on.',
            tiers: { genuine: 45, commercial: 25 }, choice: 'genuine', status: 'approved' }
        ] },
      { id: 'J1026', plate: '10-90876', car: { brand: 'Porsche', model: 'Cayenne', year: 2015 }, km: 121900,
        customer: { name: 'زبون تجريبي 3', phone: '0772223344' }, stage: 'qc', etaAr: 'خلال ساعة', etaEn: 'Within the hour',
        log: [['in', 400], ['lift', 380], ['approval', 350], ['repair', 240], ['qc', 20]],
        findings: [
          { id: 'f1', illus: 'brake', urgency: 'soon',
            titleAr: 'ديسكات وفحمات خلفية', titleEn: 'Rear discs and pads',
            noteAr: 'الديسكات فيها تحفير.', noteEn: 'The discs are scored.',
            tiers: { genuine: 240, commercial: 150 }, choice: 'genuine', status: 'approved' },
          { id: 'f2', illus: 'wiper', urgency: 'ok',
            titleAr: 'مساحة خلفية', titleEn: 'Rear wiper',
            noteAr: 'مهترية.', noteEn: 'Worn.',
            tiers: { genuine: 22, commercial: 12 }, choice: 'commercial', status: 'declined' }
        ] }
    ],
    bookings: [
      { id: 'B-3101', car: { brand: 'Volkswagen', model: 'Golf', year: 2017 }, plate: '', km: '', kind: 'symptom', ref: 'heater',
        note: '', inDays: 1, period: 'am', name: 'زبون تجريبي 4', phone: '0795550001', status: 'new', agoMin: 50 },
      { id: 'B-3102', car: { brand: 'Porsche', model: 'Macan', year: 2018 }, plate: '', km: '', kind: 'service', ref: 'winter',
        note: '', inDays: 2, period: 'pm', name: 'زبون تجريبي 5', phone: '0785550002', status: 'confirmed', agoMin: 300 }
    ],
    history: {
      '0791234567': { name: 'زبون تجريبي', vehicles: [
        { plate: '12-34567', brand: 'Audi', model: 'A6', year: 2016, visits: [
          { date: '2026-05-12', km: 141900, workAr: 'تغيير زيت وفلتر زيت وهوا ومكيّف', workEn: 'Oil, oil filter, air and cabin filters', total: 68, kind: 'oil' },
          { date: '2025-11-03', km: 134200, workAr: 'فحمات وديسكات خلفية', workEn: 'Rear pads and discs', total: 95, warrantyAr: '3 شهور أو 5,000 كم', warrantyEn: '3 months or 5,000 km', kind: 'brakes' },
          { date: '2025-05-20', km: 127600, workAr: 'صيانة دورية كاملة', workEn: 'Full scheduled service', total: 120, kind: 'oil' }
        ] }
      ] }
    }
  }
};
