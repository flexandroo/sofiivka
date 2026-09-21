(function () {
  "use strict";

  const VERIFIED_ON = "2026-09-21";
  const WILO_BASE = "https://wilo.com/ua/uk/Обладнання/uk/virobi";
  const REACH_URL = "https://cms.media.wilo.com/dcidocpfinder/wilo189146/1624926/wilo189146.pdf";
  const REACH_DOC = Object.freeze({ type: "PDF", title: "Wilo — регламент REACH", language: "Нейтрально", url: "/assets/products/wilo/documents/wilo-reach-statement.pdf" });

  const series = Object.freeze({
    yonos: Object.freeze({
      sourceCategoryId: "wilo-circulation",
      seriesId: "wilo-yonos-pico1-0",
      seriesName: "Yonos PICO1.0",
      seriesPath: "yonos-pico1-0_id194",
      productType: "Циркуляційний насос з мокрим ротором",
      applications: Object.freeze(["водяні системи опалення", "контури теплої підлоги", "системи кондиціонування", "промислові циркуляційні системи"]),
      features: Object.freeze([
        "Електронне регулювання перепаду тиску",
        "EC-двигун із низьким енергоспоживанням",
        "Режими Δp-v і Δp-c для радіаторних та підлогових систем",
        "Світлодіодна індикація заданого значення і споживаної потужності",
        "Ручна функція видалення повітря",
        "Швидке електричне під’єднання Wilo-Connector",
        "Автоматичний повторний запуск і захист двигуна"
      ]),
      commonSpecs: Object.freeze([
        ["Максимальний робочий тиск", "10 бар"],
        ["Температура перекачуваного середовища", "−10…+95 °C"],
        ["Температура навколишнього середовища", "−10…+40 °C"],
        ["Під’єднання до мережі", "1~230 V ±10%, 50/60 Hz"],
        ["Клас ізоляції", "F"],
        ["Клас захисту", "IPX4D"],
        ["Корпус насоса", "Сірий чавун"],
        ["Робоче колесо", "PP-GF40"],
        ["Вал", "Нержавіюча сталь"],
        ["Матеріал підшипника", "Металонасичений графіт"],
        ["Режими регулювання", "Δp-v, Δp-c"],
        ["Електричне під’єднання", "Wilo-Connector"]
      ]),
      imageSource: "https://cms.media.wilo.com/dcipicpfinder/wilo462614/5830682/wilo462614_3.png",
      documents: Object.freeze([
        Object.freeze({ type: "PDF", title: "Інструкція Wilo-Yonos PICO1.0", language: "Українська", url: "/assets/products/wilo/documents/yonos-pico1-manual-uk.pdf" }),
        REACH_DOC
      ]),
      documentSources: Object.freeze(["https://cms.media.wilo.com/dcidocpfinder/wilo509719/5900837/wilo509719.pdf", REACH_URL])
    }),
    starz: Object.freeze({
      sourceCategoryId: "wilo-dhw-circulation",
      seriesId: "wilo-star-z-nova",
      seriesName: "Star-Z NOVA",
      seriesPath: "star-z-nova_id146",
      productType: "Циркуляційний насос ГВП",
      applications: Object.freeze(["циркуляція питної гарячої води", "системи ГВП одноквартирних будинків"]),
      features: Object.freeze([
        "Корпус насоса з латуні CW617N",
        "Споживана потужність від 3 Вт залежно від виконання",
        "Теплоізоляційний кожух у комплекті",
        "Швидке електричне під’єднання Wilo-Connector",
        "Виконання A і T мають кульовий запірний та зворотний клапани",
        "Виконання T має реле часу, термостат і розпізнавання термічної дезінфекції"
      ]),
      commonSpecs: Object.freeze([
        ["Максимальний робочий тиск", "10 бар"],
        ["Максимальний напір", "1,0 м"],
        ["Максимальна подача", "0,4 м³/год"],
        ["Температура перекачуваного середовища", "+2…+95 °C"],
        ["Температура навколишнього середовища", "+2…+40 °C"],
        ["Максимальна загальна жорсткість у системах питної води", "3,57 ммоль/л (20 °dH)"],
        ["Під’єднання до мережі", "1~230 V, 50 Hz"],
        ["Номінальний струм", "0,05 A"],
        ["Максимальне число обертів", "3000 1/min"],
        ["Клас ізоляції", "F"],
        ["Клас захисту двигуна", "IP42"],
        ["Корпус насоса", "Латунь CW617N"],
        ["Робоче колесо", "PPE/PS-GF30"],
        ["Вал", "Кераміка"],
        ["Матеріал підшипника", "Графіт, просочений синтетичною смолою"]
      ]),
      documents: Object.freeze([
        Object.freeze({ type: "PDF", title: "Інструкція Wilo-Star-Z NOVA", language: "Багатомовна, містить українську", url: "/assets/products/wilo/documents/star-z-nova-manual.pdf" }),
        REACH_DOC
      ]),
      documentSources: Object.freeze(["https://cms.media.wilo.com/dcidocpfinder/wilo_f_02000031000079a100010092/1177497/wilo_f_02000031000079a100010092.pdf", REACH_URL])
    }),
    himulti: Object.freeze({
      sourceCategoryId: "wilo-multistage",
      seriesId: "wilo-himulti-3",
      seriesName: "HiMulti 3",
      seriesPath: "himulti-3_id516",
      productType: "Багатоступеневий відцентровий насос",
      applications: Object.freeze(["приватне водопостачання", "полив і зрошення", "використання дощової води"]),
      features: Object.freeze([
        "Багатоступенева горизонтальна гідравлічна частина",
        "Нормальновсмоктувальне або самовсмоктувальне виконання P",
        "Швидке електричне під’єднання Wilo-Connector",
        "Термічний захисний вимикач двигуна",
        "Під’єднання G 1 зі всмоктувальної та напірної сторін",
        "Максимальний робочий тиск 8 бар"
      ]),
      commonSpecs: Object.freeze([
        ["Максимальний робочий тиск", "8 бар"],
        ["Максимальний тиск притоку", "3 бар"],
        ["Температура перекачуваного середовища", "+5…+35 °C"],
        ["Температура навколишнього середовища", "−15…+50 °C"],
        ["Під’єднання до мережі", "1~230 V, 50 Hz"],
        ["Номінальне число обертів", "2900 1/min"],
        ["Клас ізоляції", "F"],
        ["Клас захисту двигуна", "IPX4"],
        ["Всмоктувальний патрубок", "G 1"],
        ["Напірний патрубок", "G 1"],
        ["Корпус насоса", "PA6T/6I-GF40"],
        ["Робоче колесо", "PPE/PS-GF30"],
        ["Вал", "Нержавіюча сталь"],
        ["Ущільнення вала", "BVPFF"],
        ["Матеріал ущільнення", "EPDM"]
      ]),
      imageSource: "https://cms.media.wilo.com/dcipicpfinder/wilo44541/1169644/wilo44541_3.png",
      documents: Object.freeze([
        Object.freeze({ type: "PDF", title: "Інструкція Wilo-HiMulti 3", language: "Багатомовна, містить українську", url: "/assets/products/wilo/documents/himulti-3-manual.pdf" }),
        REACH_DOC
      ]),
      documentSources: Object.freeze(["https://cms.media.wilo.com/dcidocpfinder/wilo452075/5401207/wilo452075.pdf", REACH_URL])
    }),
    drain: Object.freeze({
      sourceCategoryId: "wilo-drainage",
      seriesId: "wilo-drain-tm-32",
      seriesName: "Drain TM/TMW/TMR 32",
      seriesPath: "drain-tm-tmw-tmr-32_id701",
      productType: "Дренажний занурювальний насос",
      applications: Object.freeze(["відведення стічної води без фекалій", "перекачування забрудненої води з невеликою кількістю піску та гравію", "стаціонарна або мобільна занурена установка"]),
      features: Object.freeze([
        "Готове до під’єднання виконання Plug&Pump",
        "Корпус двигуна з нержавіючої сталі",
        "Термічний контроль двигуна з автоматичним перемиканням",
        "Клас захисту IP68",
        "Вбудований поплавковий вимикач у автоматичних виконаннях",
        "TMW створює завихрення у приямку, TMR відкачує до залишкового рівня 2 мм"
      ]),
      commonSpecs: Object.freeze([
        ["Максимальний робочий тиск", "2 бар"],
        ["Тип гідравліки", "Відкрите багатоканальне робоче колесо"],
        ["Температура перекачуваного середовища", "+3…+35 °C"],
        ["Короткочасна температура середовища", "До +90 °C протягом 3 хв"],
        ["Під’єднання до мережі", "1~230 V, 50 Hz"],
        ["Допуск напруги", "±10 %"],
        ["Тип пуску", "DOL"],
        ["Номінальне число обертів", "2900 1/min"],
        ["Максимальна частота увімкнень", "50 1/h"],
        ["Клас ізоляції", "F"],
        ["Клас захисту", "IP68"],
        ["Режим роботи у зануреному стані", "S1"],
        ["Режим роботи у незануреному стані", "S3-25%"],
        ["Тип кабелю", "H07RN-F, 3G1"],
        ["Захист двигуна", "Біметалевий"],
        ["Корпус насоса", "PP-GF30"],
        ["Робоче колесо", "PPE/PS-GF20"],
        ["Матеріал двигуна", "Нержавіюча сталь"],
        ["Напірний патрубок", "G 1¼"]
      ]),
      documents: Object.freeze([
        Object.freeze({ type: "PDF", title: "Інструкція Wilo-Drain TM/TMW/TMR 32", language: "Українська", url: "/assets/products/wilo/documents/drain-tm-manual-uk.pdf" }),
        Object.freeze({ type: "PDF", title: "Сертифікаційний буклет Wilo-Drain TM/TMW/TMR 32", language: "Нейтрально", url: "/assets/products/wilo/documents/drain-tm-certificate.pdf" })
      ]),
      documentSources: Object.freeze(["https://cms.media.wilo.com/dcidocpfinder/wilo599733/7315568/wilo599733.pdf", "https://cms.media.wilo.com/dcidocpfinder/wilo555005/6830982/wilo555005.pdf"])
    }),
    stratos: Object.freeze({
      sourceCategoryId: "wilo-system-circulation",
      seriesId: "wilo-stratos-maxo",
      seriesName: "Stratos MAXO",
      seriesPath: "stratos-maxo_id171",
      productType: "Системний циркуляційний насос",
      applications: Object.freeze(["комерційні системи опалення", "контури охолодження і кондиціонування", "водно-гліколеві системи", "інженерні системи з BMS"]),
      features: Object.freeze([
        "EC-двигун з електронним регулюванням потужності",
        "Майстер налаштування за типом застосування",
        "Dynamic Adapt plus, Multi-Flow Adaptation, T-const. і ΔT-const.",
        "Облік тепла й холоду та функція No-Flow Stop",
        "Кольоровий дисплей 4,3 дюйма",
        "Bluetooth і Wilo Net",
        "Інтеграція BACnet, Modbus, CANopen, LON або PLR через модулі"
      ]),
      commonSpecs: Object.freeze([
        ["Максимальний робочий тиск", "10 бар"],
        ["Температура перекачуваного середовища", "−10…+110 °C"],
        ["Температура навколишнього середовища", "−10…+40 °C"],
        ["Під’єднання до мережі", "1~230 V ±10%, 50/60 Hz"],
        ["Мінімальне число обертів", "750 1/min"],
        ["Клас ізоляції", "F"],
        ["Клас захисту", "IPX4D"],
        ["Монтажна довжина", "180 мм"],
        ["Корпус насоса", "Сірий чавун"],
        ["Робоче колесо", "PPS-GF40"],
        ["Вал", "Нержавіюча сталь"],
        ["Матеріал підшипника", "Графіт"],
        ["Дисплей", "Графічний кольоровий, 4,3 дюйма"],
        ["Бездротовий обмін даними", "Bluetooth"],
        ["Цифрові виходи", "SSM, SBM"]
      ]),
      imageSource: "https://cms.media.wilo.com/dcipicpfinder/wilo57832/4809798/wilo57832_3.png",
      documents: Object.freeze([
        Object.freeze({ type: "PDF", title: "Інструкція Wilo-Stratos MAXO/-D/-Z", language: "Українська", url: "/assets/products/wilo/documents/stratos-maxo-manual-uk.pdf" }),
        REACH_DOC
      ]),
      documentSources: Object.freeze(["https://cms.media.wilo.com/dcidocpfinder/wilo615119/7558468/wilo615119.pdf", REACH_URL])
    })
  });

  const models = Object.freeze([
    { s: "yonos", id: "4248082", model: "Yonos PICO1.0 25/1-4", ean: "4062679175232", head: 4.3, flow: 2.7, eei: "≤ 0,20", powerMin: 4, powerMax: 20, connection: "G 1½ / Rp 1 / DN 25", length: 180, dims: [180, 102, 131], weight: 1.8, diagram: "https://cms.media.wilo.com/dcipicpfinder/wilo488526/5792528/wilo488526_3.png" },
    { s: "yonos", id: "4248084", model: "Yonos PICO1.0 25/1-6", ean: "4062679182025", head: 6.0, flow: 3.6, eei: "≤ 0,20", powerMin: 4, powerMax: 40, connection: "G 1½ / Rp 1 / DN 25", length: 180, dims: [180, 102, 131], weight: 1.8, diagram: "https://cms.media.wilo.com/dcipicpfinder/wilo488523/5792438/wilo488523_3.png" },
    { s: "yonos", id: "4248086", model: "Yonos PICO1.0 25/1-8", ean: "4062679182063", head: 7.6, flow: 4.4, eei: "≤ 0,23", powerMin: 4, powerMax: 75, connection: "G 1½ / Rp 1 / DN 25", length: 180, dims: [180, 102, 143], weight: 2.0, diagram: "https://cms.media.wilo.com/dcipicpfinder/wilo488529/5792510/wilo488529_3.png" },
    { s: "yonos", id: "4248088", model: "Yonos PICO1.0 30/1-4", ean: "4062679182087", head: 4.3, flow: 2.7, eei: "≤ 0,20", powerMin: 4, powerMax: 20, connection: "G 2 / Rp 1½ / DN 30", length: 180, dims: [180, 102, 131], weight: 1.9, diagram: "https://cms.media.wilo.com/dcipicpfinder/wilo488532/5792492/wilo488532_3.png" },
    { s: "yonos", id: "4248089", model: "Yonos PICO1.0 30/1-6", ean: "4062679182094", head: 6.0, flow: 3.6, eei: "≤ 0,20", powerMin: 4, powerMax: 40, connection: "G 2 / Rp 1½ / DN 30", length: 180, dims: [180, 102, 131], weight: 1.9, diagram: "https://cms.media.wilo.com/dcipicpfinder/wilo488533/5792366/wilo488533_3.png" },
    { s: "yonos", id: "4248091", model: "Yonos PICO1.0 30/1-8", ean: "4062679182100", head: 7.6, flow: 4.4, eei: "≤ 0,23", powerMin: 4, powerMax: 75, connection: "G 2 / Rp 1½ / DN 30", length: 180, dims: [180, 102, 143], weight: 2.2, diagram: "https://cms.media.wilo.com/dcipicpfinder/wilo488528/5792384/wilo488528_3.png" },

    { s: "starz", id: "4132760", model: "Star-Z NOVA", ean: "4048482094151", head: 1, flow: 0.4, powerMin: 3, powerMax: 5, connection: "Rp ½", length: 84, dims: [119, 83, 84], weight: 0.8, imageSource: "https://cms.media.wilo.com/dcipicpfinder/wilo356610/5830754/wilo356610_3.png", diagram: "https://cms.media.wilo.com/dcipicpfinder/wilo_f_0200002c000329ca00010092/1124616/wilo_f_0200002c000329ca00010092_3.png", options: "Базове виконання" },
    { s: "starz", id: "4132761", model: "Star-Z NOVA A", ean: "4048482094168", head: 1, flow: 0.4, powerMin: 3, powerMax: 5, connection: "G 1", length: 138, dims: [119, 83, 138], weight: 1.0, imageSource: "https://cms.media.wilo.com/dcipicpfinder/wilo355737/5830736/wilo355737_3.png", diagram: "https://cms.media.wilo.com/dcipicpfinder/wilo_f_0200002c0003294000010092/1124580/wilo_f_0200002c0003294000010092_3.png", options: "Кульовий запірний клапан і зворотний клапан" },
    { s: "starz", id: "4222650", model: "Star-Z NOVA T", ean: "4048482853406", head: 1, flow: 0.4, powerMin: 5, powerMax: 7, connection: "G 1", length: 138, dims: [152, 83, 138], weight: 1.2, imageSource: "https://cms.media.wilo.com/dcipicpfinder/wilo204976/5830718/wilo204976_3.png", diagram: "https://cms.media.wilo.com/dcipicpfinder/wilo174561/1480595/wilo174561_3.png", options: "Кульовий запірний і зворотний клапани, реле часу, термостат, розпізнавання термічної дезінфекції" },

    { s: "himulti", id: "4244127", model: "HiMulti 3-23 /1/5/230", ean: "4062679117683", power: 0.4, current: 2.7, selfPriming: false, dims: [415, 203, 187], weight: 7.8, diagram: "https://cms.media.wilo.com/dcipicpfinder/wilo530563/6463921/wilo530563_3.png" },
    { s: "himulti", id: "4244128", model: "HiMulti 3-24 /1/5/230", ean: "4062679117690", power: 0.4, current: 2.7, selfPriming: false, dims: [439, 203, 187], weight: 8.3, diagram: "https://cms.media.wilo.com/dcipicpfinder/wilo530556/6463939/wilo530556_3.png" },
    { s: "himulti", id: "4244129", model: "HiMulti 3-25 /1/5/230", ean: "4062679117706", power: 0.5, current: 3.2, selfPriming: false, dims: [464, 216, 187], weight: 9.3, diagram: "https://cms.media.wilo.com/dcipicpfinder/wilo530557/6463777/wilo530557_3.png" },
    { s: "himulti", id: "4244147", model: "HiMulti 3-23 P/1/5/230", ean: "4062679117881", power: 0.4, current: 2.7, selfPriming: true, dims: [415, 203, 187], weight: 7.8, diagram: "https://cms.media.wilo.com/dcipicpfinder/wilo530544/6464101/wilo530544_3.png" },
    { s: "himulti", id: "4244148", model: "HiMulti 3-24 P/1/5/230", ean: "4062679117898", power: 0.4, current: 2.7, selfPriming: true, dims: [439, 203, 187], weight: 8.3, diagram: "https://cms.media.wilo.com/dcipicpfinder/wilo530537/6464083/wilo530537_3.png" },
    { s: "himulti", id: "4244149", model: "HiMulti 3-25 P/1/5/230", ean: "4062679117904", power: 0.5, current: 3.2, selfPriming: true, dims: [464, 216, 187], weight: 9.3, diagram: "https://cms.media.wilo.com/dcipicpfinder/wilo530546/6464065/wilo530546_3.png" },

    { s: "drain", id: "4048411", model: "Drain TM 32/8-10M", ean: "4016322477402", power: 0.37, inputPower: 450, current: 2.2, passage: 10, immersion: 3, cable: 10, floatSwitch: false, dims: [165, 294, 165], weight: 5.2, imageSource: "https://cms.media.wilo.com/dcipicpfinder/wilo_f_020000250002e53c00010092/1653093/wilo_f_020000250002e53c00010092_3.png", diagram: "https://cms.media.wilo.com/dcipicpfinder/wilo_f_020000190000e48100010092/1518441/wilo_f_020000190000e48100010092_3.png" },
    { s: "drain", id: "4048412", model: "Drain TM 32/7", ean: "4016322477419", power: 0.25, inputPower: 320, current: 1.5, passage: 10, immersion: 1, cable: 4, floatSwitch: true, dims: [165, 294, 165], weight: 4.7, imageSource: "https://cms.media.wilo.com/dcipicpfinder/wilo_f_020000250002e53c00010092/1653093/wilo_f_020000250002e53c00010092_3.png", diagram: "https://cms.media.wilo.com/dcipicpfinder/wilo_f_020000190000e48100010092/1518441/wilo_f_020000190000e48100010092_3.png" },
    { s: "drain", id: "4048413", model: "Drain TMW 32/8", ean: "4016322477426", power: 0.37, inputPower: 450, current: 2.1, passage: 10, immersion: 1, cable: 4, floatSwitch: true, dims: [165, 296, 165], weight: 5.0, imageSource: "https://cms.media.wilo.com/dcipicpfinder/wilo_f_020000250002e21200010092/1653111/wilo_f_020000250002e21200010092_3.png", diagram: "https://cms.media.wilo.com/dcipicpfinder/wilo_f_02000019000237f200010092/1518459/wilo_f_02000019000237f200010092_3.png" },
    { s: "drain", id: "4048414", model: "Drain TMW 32/11", ean: "4016322477433", power: 0.55, inputPower: 750, current: 3.6, passage: 10, immersion: 1, cable: 4, floatSwitch: true, dims: [165, 326, 165], weight: 6.3, imageSource: "https://cms.media.wilo.com/dcipicpfinder/wilo_f_020000250002e21200010092/1653111/wilo_f_020000250002e21200010092_3.png", diagram: "https://cms.media.wilo.com/dcipicpfinder/wilo_f_02000019000237f200010092/1518459/wilo_f_02000019000237f200010092_3.png" },
    { s: "drain", id: "4145325", model: "Drain TMR 32/8", ean: "4048482104744", power: 0.37, inputPower: 450, current: 1.8, passage: 2, immersion: 1, cable: 4, floatSwitch: true, dims: [165, 278, 165], weight: 4.9, imageSource: "https://cms.media.wilo.com/dcipicpfinder/wilo_f_020000250002e3a700010092/1657123/wilo_f_020000250002e3a700010092_3.png", diagram: "https://cms.media.wilo.com/dcipicpfinder/wilo_f_020000190002376b00010092/1518423/wilo_f_020000190002376b00010092_3.png" },

    { s: "stratos", id: "2164567", model: "Stratos MAXO 25/0,5-4 PN 10", ean: "4048482699189", head: 4.2, flow: 8.1, eei: "≤ 0,18", powerMin: 7, powerMax: 80, currentMin: 0.11, currentMax: 0.58, speedMax: 2550, connection: "G 1½ / Rp 1 / DN 25", dims: [335, 180, 210], weight: 7.2, diagram: "https://cms.media.wilo.com/dcipicpfinder/wilo211638/2277019/wilo211638_3.png" },
    { s: "stratos", id: "2164568", model: "Stratos MAXO 25/0,5-6 PN 10", ean: "4048482699363", head: 6.2, flow: 9.7, eei: "≤ 0,18", powerMin: 7, powerMax: 135, currentMin: 0.11, currentMax: 0.95, speedMax: 3050, connection: "G 1½ / Rp 1 / DN 25", dims: [335, 180, 210], weight: 7.2, diagram: "https://cms.media.wilo.com/dcipicpfinder/wilo211627/2277001/wilo211627_3.png" },
    { s: "stratos", id: "2164573", model: "Stratos MAXO 30/0,5-6 PN 10", ean: "4048482699424", head: 6.1, flow: 9.8, eei: "≤ 0,18", powerMin: 7, powerMax: 135, currentMin: 0.11, currentMax: 0.95, speedMax: 3050, connection: "G 2 / Rp 1½ / DN 30", dims: [335, 180, 210], weight: 7.2, diagram: "https://cms.media.wilo.com/dcipicpfinder/wilo211644/2277404/wilo211644_3.png" },
    { s: "stratos", id: "2164574", model: "Stratos MAXO 30/0,5-8 PN 10", ean: "4048482699431", head: 8.5, flow: 10.0, eei: "≤ 0,19", powerMin: 7, powerMax: 160, currentMin: 0.11, currentMax: 1.05, speedMax: 3600, connection: "G 2 / Rp 1½ / DN 30", dims: [335, 180, 210], weight: 7.2, diagram: "https://cms.media.wilo.com/dcipicpfinder/wilo211635/2277710/wilo211635_3.png" }
  ]);

  function modelSpecs(model, config) {
    const values = [];
    if (Number.isFinite(model.head)) values.push(["Максимальний напір", `${String(model.head).replace(".", ",")} м`]);
    if (Number.isFinite(model.flow)) values.push(["Максимальна подача", `${String(model.flow).replace(".", ",")} м³/год`]);
    if (model.eei) values.push(["Індекс енергетичної ефективності (EEI)", model.eei]);
    if (Number.isFinite(model.power)) values.push(["Номінальна потужність двигуна P2", `${String(model.power).replace(".", ",")} кВт`]);
    if (Number.isFinite(model.powerMin)) values.push(["Споживана потужність P1", `${model.powerMin}–${model.powerMax} Вт`]);
    if (Number.isFinite(model.inputPower)) values.push(["Максимальна споживана потужність P1", `${model.inputPower} Вт`]);
    if (Number.isFinite(model.current)) values.push(["Номінальний струм", `${String(model.current).replace(".", ",")} A`]);
    if (Number.isFinite(model.currentMin)) values.push(["Номінальний струм", `${String(model.currentMin).replace(".", ",")}–${String(model.currentMax).replace(".", ",")} A`]);
    if (Number.isFinite(model.speedMax)) values.push(["Максимальне число обертів", `${model.speedMax} 1/min`]);
    if (model.connection) values.push(["Під’єднання до трубопроводу", model.connection]);
    if (Number.isFinite(model.length)) values.push(["Монтажна довжина", `${model.length} мм`]);
    if (typeof model.selfPriming === "boolean") values.push(["Самовсмоктувальне виконання", model.selfPriming ? "Так" : "Ні"]);
    if (Number.isFinite(model.passage)) values.push(["Вільний сферичний прохід", `${model.passage} мм`]);
    if (Number.isFinite(model.immersion)) values.push(["Максимальна глибина занурення", `${model.immersion} м`]);
    if (Number.isFinite(model.cable)) values.push(["Довжина кабелю", `${model.cable} м`]);
    if (typeof model.floatSwitch === "boolean") values.push(["Поплавковий вимикач", model.floatSwitch ? "Так" : "Ні"]);
    if (model.options) values.push(["Оснащення виконання", model.options]);
    values.push(["Довжина", `${model.dims[0]} мм`], ["Висота", `${model.dims[1]} мм`], ["Ширина", `${model.dims[2]} мм`], ["Маса нетто", `${String(model.weight).replace(".", ",")} кг`]);
    return Object.freeze([...values, ...config.commonSpecs].map(item => Object.freeze(item)));
  }

  function featuresFor(model, config) {
    const common = {
      productType: config.productType,
      powerKw: Number.isFinite(model.power) ? model.power : Number.isFinite(model.powerMax) ? Number((model.powerMax / 1000).toFixed(3)) : undefined,
      connection: model.connection || (model.s === "himulti" ? "G 1 / G 1" : model.s === "drain" ? "G 1¼" : undefined),
      voltage: "1~230 V",
      protectionClass: model.s === "drain" ? "IP68" : model.s === "himulti" ? "IPX4" : model.s === "starz" ? "IP42" : "IPX4D",
      pressureBar: model.s === "drain" ? 2 : model.s === "himulti" ? 8 : 10,
      temperature: model.s === "drain" ? "+3…+35 °C" : model.s === "himulti" ? "+5…+35 °C" : model.s === "starz" ? "+2…+95 °C" : model.s === "stratos" ? "−10…+110 °C" : "−10…+95 °C",
      weightKg: model.weight,
      depthMm: model.dims[0],
      heightMm: model.dims[1],
      widthMm: model.dims[2]
    };
    if (Number.isFinite(model.head)) common.headM = model.head;
    if (Number.isFinite(model.flow)) common.flowM3h = model.flow;
    if (Number.isFinite(model.length)) common.mountingLengthMm = model.length;
    if (model.eei) common.eei = model.eei;
    if (model.s === "yonos") common.control = "Δp-v / Δp-c";
    if (model.s === "stratos") common.control = "Електронне, BMS / Wilo Net";
    if (model.s === "himulti") common.selfPriming = model.selfPriming ? "yes" : "no";
    if (model.s === "drain") {
      common.maxImmersionDepthM = model.immersion;
      common.freePassageMm = model.passage;
      common.cableLengthM = model.cable;
      common.floatSwitch = model.floatSwitch ? "yes" : "no";
    }
    return Object.freeze(Object.fromEntries(Object.entries(common).filter(([, value]) => value !== undefined)));
  }

  function descriptionFor(model, config) {
    if (model.s === "yonos") return `Високоефективний циркуляційний насос ${model.model} для водяних систем опалення, теплої підлоги та кондиціонування. Електронне регулювання допомагає налаштувати робочу точку за перепадом тиску.`;
    if (model.s === "starz") return `Циркуляційний насос ${model.model} для контурів гарячого водопостачання. Латунний корпус розрахований на циркуляцію питної води, а оснащення залежить від виконання моделі.`;
    if (model.s === "himulti") return `Горизонтальний багатоступеневий насос ${model.model} для приватного водопостачання, поливу та використання дощової води. ${model.selfPriming ? "Виконання P є самовсмоктувальним." : "Модель має нормальновсмоктувальне виконання."}`;
    if (model.s === "drain") return `Занурювальний дренажний насос ${model.model} для відведення стічної води без фекалій і забрудненої води з невеликою кількістю піску та гравію. Параметри кабелю, поплавка й гідравліки відповідають конкретному виконанню.`;
    return `Системний циркуляційний насос ${model.model} для комерційних систем опалення, охолодження та кондиціонування. Електронне регулювання і комунікаційні інтерфейси дають змогу інтегрувати насос у BMS.`;
  }

  function buildProduct(model) {
    const config = series[model.s];
    const manufacturerUrl = `${WILO_BASE}/${config.seriesPath}/${model.id}`;
    const seriesUrl = `${WILO_BASE}/${config.seriesPath}`;
    const description = descriptionFor(model, config);
    const localImage = `/assets/products/wilo/${model.id}/01.webp`;
    const localDiagram = `/assets/products/wilo/${model.id}/02-dimensions.webp`;
    const imageSource = model.imageSource || config.imageSource;
    const title = `Насос Wilo ${model.model}`;
    const sources = Object.freeze([manufacturerUrl, seriesUrl, imageSource, model.diagram, ...config.documentSources]);
    return Object.freeze({
      id: model.id,
      sku: model.id,
      manufacturerCode: model.id,
      manufacturer_code: model.id,
      ean: model.ean,
      EAN: model.ean,
      brand: "Wilo",
      category: model.s === "himulti" || model.s === "drain" ? "water-supply" : "heating",
      sourceCategoryId: config.sourceCategoryId,
      typeSlug: config.sourceCategoryId,
      type: config.productType,
      subcategory: config.productType,
      series: config.seriesName,
      seriesId: config.seriesId,
      model: model.model,
      title,
      productName: title,
      product_name: title,
      shortDescription: description,
      short_description: description,
      fullDescription: `${description} Під час підбору потрібно звірити робочу точку, під’єднання, електроживлення та умови монтажу з проєктом системи.`,
      full_description: `${description} Під час підбору потрібно звірити робочу точку, під’єднання, електроживлення та умови монтажу з проєктом системи.`,
      description,
      descriptionSections: Object.freeze([
        Object.freeze({ title: "Для яких систем", paragraphs: Object.freeze([`Підходить для: ${config.applications.join(", ")}.`]) }),
        Object.freeze({ title: "Що важливо у моделі", paragraphs: Object.freeze([config.features.slice(0, 5).join("; ") + "."]) }),
        Object.freeze({ title: "Підбір", paragraphs: Object.freeze(["Перед замовленням звірте робочу точку, приєднання, електроживлення та монтажні обмеження. Якщо потрібен гідравлічний підбір, передайте менеджеру розрахункову витрату й напір."]) })
      ]),
      keyFeatures: config.features,
      key_features: config.features,
      applications: config.applications,
      compatibility: "",
      technicalDetails: modelSpecs(model, config),
      features: featuresFor(model, config),
      attributes: Object.freeze([]),
      image: localImage,
      mainImage: localImage,
      main_image: localImage,
      images: Object.freeze([localImage, localDiagram]),
      galleryImages: Object.freeze([localImage, localDiagram]),
      gallery_images: Object.freeze([localImage, localDiagram]),
      dimensionDiagram: localDiagram,
      dimension_diagram: localDiagram,
      imageSourceUrl: imageSource,
      image_source_url: imageSource,
      documents: config.documents,
      manualPdf: config.documents[0]?.url || "",
      manual_pdf: config.documents[0]?.url || "",
      datasheetPdf: "",
      datasheet_pdf: "",
      certificatePdf: config.documents.find(item => /сертиф/i.test(item.title))?.url || "",
      certificate_pdf: config.documents.find(item => /сертиф/i.test(item.title))?.url || "",
      manufacturerUrl,
      manufacturer_url: manufacturerUrl,
      sourceUrls: sources,
      source_urls: sources,
      dateVerified: VERIFIED_ON,
      date_verified: VERIFIED_ON,
      seo: Object.freeze({
        title: `${title} — характеристики | ТД «Софіївка»`,
        description: `${config.productType} Wilo ${model.model}: підтверджені характеристики, офіційні фото й документи виробника.`
      }),
      seoTitle: `${title} — характеристики | ТД «Софіївка»`,
      seo_title: `${title} — характеристики | ТД «Софіївка»`,
      seoDescription: `${config.productType} Wilo ${model.model}: підтверджені характеристики, офіційні фото й документи виробника.`,
      seo_description: `${config.productType} Wilo ${model.model}: підтверджені характеристики, офіційні фото й документи виробника.`,
      price: 0,
      currency: "UAH",
      availability: "unknown",
      availabilityLabel: "Наявність уточнюйте",
      condition: "new",
      conditionLabel: "Новий",
      officialCatalogEdition: "Офіційний каталог Wilo, перевірено 21.09.2026"
    });
  }

  window.sofievkaWiloProducts = Object.freeze(models.map(buildProduct));
})();
