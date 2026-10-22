document.addEventListener("DOMContentLoaded", function () {
    const STORAGE_KEY = "urbanEstateWorkspaceHistory";
    const OLD_STORAGE_KEY = "favoriteMiniCards";
    const PINNED_KEY = "urbanEstateWorkspacePinned";
    const QUICK_ORDER_KEY = "urbanEstateQuickOrder";
    const PINS_MIGRATED_KEY = "urbanEstateWorkspacePinsMigratedV2";
    const MAX_HISTORY = 50;
    const HISTORY_DAYS = 30;
    const HISTORY_TTL = HISTORY_DAYS * 24 * 60 * 60 * 1000;

    let developersDirectoryItems = [];
    let developersDirectoryLoaded = false;
    let developersDirectoryLoading = false;

    const categories = [
        { id: "tools", title: "Инструменты", description: "Рабочие инструменты", color: "#ec407a", icon: "tool" },
        { id: "estate", title: "Агрегаторы", description: "Недвижимость и базы", color: "#3b82f6", icon: "building" },
        { id: "platforms", title: "Платформы", description: "Основные площадки", color: "#8b5cf6", icon: "globe" },
        { id: "work", title: "Эффективность", description: "Планирование работы", color: "#12b76a", icon: "check" },
        { id: "maps", title: "Карты", description: "Районы и локации", color: "#f79009", icon: "map" },
        { id: "docs", title: "Документы", description: "Чек-листы и документы", color: "#667085", icon: "file" },
        { id: "social", title: "Соцсети", description: "Сайты и социальные сети", color: "#06b6d4", icon: "share" },
        { id: "ai", title: "AI Apps", description: "Искусственный интеллект", color: "#ec4899", icon: "spark" },
        { id: "office", title: "Office Apps", description: "Документы и облака", color: "#4285f4", icon: "grid" },
        { id: "news", title: "Новости", description: "Новости недвижимости", color: "#ef4444", icon: "news" },
        { id: "other", title: "Прочее", description: "Реклама и сервисы", color: "#64748b", icon: "more" },
        { id: "links", title: "Полезные ссылки", description: "Проверки и реестры", color: "#14b8a6", icon: "link" },
        { id: "developers", title: "Застройщики", description: "Контакты, сайты и материалы компаний", color: "#ec407a", icon: "building" }
    ];

    const servicesData = [
        ["my-crm","tools","Мой CRM","https://app.sbercrm.com/#/login","https://static.tildacdn.com/tild6632-3737-4563-a235-373138313033/unnamed-6.png"],
        ["calculators","tools","Калькуляторы","https://urban-estate.ru/calc","https://static.tildacdn.com/tild3265-3738-4631-b639-373264643334/b5bd57770f6fa3b82912.jpg"],
        ["calcus","tools","Калькус.ру","https://calcus.ru/","https://static.tildacdn.com/tild3631-3639-4533-a132-373638363362/Group_160.svg"],
        ["story-creator","tools","Конструктор макетов","https://urban-estate.ru/story-creator","https://static.tildacdn.com/tild3062-3865-4638-b632-323139396437/unnamed-2.png"],
        ["trendagent","estate","TrendAgent","https://trendagent.ru/","https://static.tildacdn.com/tild6335-6135-4130-b338-343239333931/4b69c1abcc678eb043e4.png"],
        ["domclick","estate","Домклик Про","https://pro.domclick.ru/","https://static.tildacdn.com/tild6336-6430-4436-b434-343739333938/512x512bb.jpg"],
        ["m2","estate","М2 Про","https://m2.ru/personal-area","https://static.tildacdn.com/tild6466-3134-4164-a532-326637366236/0d4cda885ae964a5e997.png"],
        ["nmarket","estate","НМаркет.ПРО","https://krasnodar.nmarket.pro/","https://static.tildacdn.com/tild6162-3434-4663-b535-643734333832/aa77e21d-0de6-47bb-a.webp"],
        ["pn-agent","estate","ПН Агент","https://pnpro.ru/search","https://static.rustore.ru/imgproxy/KbmqVL4uiW8ngsLlKhg6HYvfb1cnL5r_g-XMFwX-Kis/preset:web_app_icon_160/plain/https://static.rustore.ru/apk/2063604471/content/ICON/b3aec29b-e31b-490a-81d2-8cac059a8da0.jpg@webp"],
        ["itrielt","estate","ITRIELT","https://itrielt.ru/","https://static.tildacdn.com/tild6430-6334-4634-b665-316434343038/base64_i6i5eV.png"],
        ["domrf","estate","Дом РФ","https://partner.domrfbank.ru/","https://static.tildacdn.com/tild3731-3238-4530-b039-333561326230/e76f176a-df54-4d98-a.png"],
        ["avito","platforms","Авито","https://www.avito.ru/","https://static.tildacdn.com/tild3061-6163-4539-a161-383538353861/i.jpeg"],
        ["cian","platforms","ЦИАН","https://cian.ru/","https://static.tildacdn.com/tild3535-6536-4134-a333-316664663233/noroot.png"],
        ["yandex-realty","platforms","Я.Недвижимость","https://realty.yandex.ru/","https://static.tildacdn.com/tild3563-6632-4332-a466-303636383835/Yandex_Realty_icon_2.png"],
        ["yandex-rent","platforms","Я.Аренда","https://arenda.yandex.ru/realtor/lk//","https://play-lh.googleusercontent.com/H1cXAHQJ8YNYsLsCVCyNSmKM8qe11HOETAP2u7PiJ1WUihWUkDMcGRv5RrOzzxYxPwJ_kCIdr7DMnN5DNrKd=w480-h960-rw"],
        ["tasks","work","Задачи","https://tasks.google.com/tasks/","https://static.tildacdn.com/tild3638-3639-4066-b930-646566666437/unnamed.png"],
        ["keep","work","Заметки","https://keep.google.com/","https://static.tildacdn.com/tild3837-6133-4434-b635-646337653163/unnamed-2.png"],
        ["calendar","work","Календарь","https://calendar.google.com/calendar","https://static.tildacdn.com/tild3461-3039-4139-b139-313030633266/unnamed-3.png"],
        ["krasnodar-ok","maps","Краснодар (Округа)","https://yandex.ru/maps/?um=constructor%3A2ce78de040869f26d6c24b2274fcb3065c7d242d5df37fac36b3a10fa8aac07c&source=constructorLink","https://static.tildacdn.com/tild3063-3136-4434-b763-393763623665/Flag_of_Krasnodar_Kr.png"],
        ["krasnodar-raiony","maps","Краснодар (Районы)","https://yandex.ru/maps/?um=constructor%3A6a62c73c41eb9730d2842760a09afdb423a7f41195057d5435c8c379dbcf8d94&source=constructorLink","https://static.tildacdn.com/tild3063-3136-4434-b763-393763623665/Flag_of_Krasnodar_Kr.png"],
        ["rostov-raiony","maps","Ростов (Районы)","https://yandex.ru/maps/?um=constructor%3A7408aeba7ecea5625543911e2747a9579e82373505498148f66246aabbf723cf&source=constructorLink","https://static.tildacdn.com/tild3739-3062-4734-b832-346264393762/Flag_of_Rostov_Oblas.jpg"],
        ["rostov-micro","maps","Ростов (Микрорайоны)","https://yandex.ru/maps/?um=constructor%3A2ec5d11180f8207af588116d8b4f7a0e0cfb5abfa3cc50afabf4b8db4fcbde2a&source=constructorLink","https://static.tildacdn.com/tild3739-3062-4734-b832-346264393762/Flag_of_Rostov_Oblas.jpg"],
        ["checklists","docs","Чек-листы","https://disk.yandex.ru/client/disk/!URBAN%20Estate/%D0%94%D0%BE%D0%BA%D1%83%D0%BC%D0%B5%D0%BD%D1%82%D1%8B/%D0%A7%D0%B5%D0%BA-%D0%BB%D0%B8%D1%81%D1%82%D1%8b","https://static.tildacdn.com/tild3836-6462-4430-b433-613431353432/text.png"],
        ["memo","docs","Памятки","https://disk.yandex.ru/client/disk/!URBAN%20Estate/%D0%94%D0%BE%D0%BA%D1%83%D0%BC%D0%B5%D0%BD%D1%82%D1%8B/%D0%9F%D0%B0%D0%BC%D1%8F%D1%82%D0%BA%D0%B8%20%D0%B8%20%D0%B8%D0%BD%D1%81%D1%82%D1%80%D1%83%D0%BA%D1%86%D0%B8%D0%B8","https://static.tildacdn.com/tild3431-3665-4339-a365-353333316664/image-2.png"],
        ["templates","docs","Образцы","https://disk.yandex.ru/client/disk/!URBAN%20Estate/%D0%94%D0%BE%D0%BA%D1%83%D0%BC%D0%B5%D0%BD%D1%82%D1%8B/%D0%9E%D0%B1%D1%80%D0%B0%D0%B7%D1%86%D1%8b","https://static.tildacdn.com/tild3639-3965-4630-a639-326633663536/font-file.png"],
        ["reports","docs","Отчеты","https://drive.google.com/drive/folders/1ccIipOr6MgiUsqj10stZrBMLl-ENZxKv","https://static.tildacdn.com/tild3165-6264-4236-b865-663239623532/free-icon-profit-rep.png"],
        ["ip-docs","docs","Документы ИП","https://disk.yandex.ru/client/disk/!URBAN%20Estate/%D0%94%D0%BE%D0%BA%D1%83%D0%BC%D0%B5%D0%BD%D1%82%D1%8B/%D0%A3%D1%87%D1%80%D0%B5%D0%B4%D0%B8%D1%82%D0%B5%D0%BB%D1%8C%D0%BD%D1%8B%D0%B5%20%D0%B4%D0%BE%D0%BA%D1%83%D0%BC%D0%B5%D0%BD%D1%82%D1%8B","https://static.rustore.ru/imgproxy/LTTmGiZbRuiSJbZp3PdqF_huYtfrz1W7DwVBq5v87W0/preset:web_app_icon_160/plain/https://static.rustore.ru/apk/701753535/content/ICON/5be5db10-fc6a-4f4e-8dc0-8946788de636.png@webp"],
        ["website","social","Сайт","https://urban-estate.ru/","https://static.tildacdn.com/tild6233-3635-4635-a332-353438313461/logoo.png"],
        ["vk","social","Сообщество ВК","https://vk.com/urbanestate","https://static.rustore.ru/imgproxy/PTo8g-Giv9VHYo7_Rwxw_1wC07KtDM7eSJgAfMlv53s/preset:web_app_icon_160/plain/https://static.rustore.ru/3f3d7180-6eb9-45ad-8706-f467c6dcf82a@webp"],
        ["telegram","social","Telegram-канал","https://t.me/urban_estate_krasnodar","https://static.tildacdn.com/tild3838-6565-4362-a361-346163393833/unnamed-2.png"],
        ["max","social","MAX-канал","https://max.ru/id613205115339_biz","https://static.tildacdn.com/tild3265-3038-4038-b863-303439386662/IlwnOob3_b8V56ug0ufB.jpg"],
        ["tiktok","social","TikTok","https://www.tiktok.com/@urban_estate","https://static.tildacdn.com/tild3866-6137-4534-b434-353132303666/unnamed-5.png"],
        ["deepseek","ai","DeepSeek","https://chat.deepseek.com/","https://static.tildacdn.com/tild3564-6535-4237-b163-666336313931/unnamed-4.png"],
        ["gigachat","ai","GigaChat","https://giga.chat/","https://static.tildacdn.com/tild6663-6539-4362-a366-613332313938/0b3c1ca9-c361-4c98-9.webp"],
        ["alice","ai","Алиса AI","https://alice.yandex.ru/","https://static.tildacdn.com/tild3137-3239-4537-a333-343739613639/f6b0a1f7-94d2-46b8-8.webp"],
        ["shedevrum","ai","Шедеврум","https://shedevrum.ai/","https://static.tildacdn.com/tild3335-3964-4339-b430-336535656235/769b590c-5cf7-40b8-b.webp"],
        ["chatgpt","ai","ChatGPT","https://chatgpt.com/","https://static.rustore.ru/imgproxy/BYW-l7hF8kZZ1lzGi-6giuB7-tZkdTKy-2yMePW0rPc/preset:web_app_icon_160/plain/https://static.rustore.ru/2025/10/7/a5/apk/2063663405/content/ICON/864e54a1-2ba2-44a7-b0e7-25aa6d55da76.png@webp"],
        ["gemini","ai","Gemini","https://gemini.google.com/app?hl=ru","https://play-lh.googleusercontent.com/bTpNtZ6rYYX2SeI-wC4cnr7MJnOh2hjtgYu3UIrSxE09lM3GPl_Uhf9_Ih2Smje2bc0V=w480-h960"],
        ["perplexity","ai","Perplexity","https://www.perplexity.ai/","https://static.tildacdn.com/tild6163-6664-4734-b465-623831643532/2ca012d1-aad9-4523-b.webp"],
        ["syntx","ai","Syntx AI","https://syntx.ai/","https://static.tildacdn.com/tild3936-6330-4632-b761-653434656564/noroot.png"],
        ["google-docs","office","Документы","https://docs.google.com/document","https://static.tildacdn.com/tild3939-3536-4335-a630-656365323831/unnamed-5.png"],
        ["google-sheets","office","Таблицы","https://docs.google.com/spreadsheets","https://static.tildacdn.com/tild3465-3937-4432-b032-313539653932/unnamed-6.png"],
        ["google-slides","office","Презентации","https://docs.google.com/presentation","https://static.tildacdn.com/tild3133-6438-4863-b731-353163313735/unnamed-7.png"],
        ["google-drive","office","Google Диск","https://drive.google.com/drive/home","https://static.tildacdn.com/tild6365-3138-4935-a430-393233356232/unnamed-8.png"],
        ["yandex-drive","office","Я.Диск","https://disk.yandex.ru/client/disk/!URBAN%20Estate","https://static.tildacdn.com/tild6632-3833-4435-b766-333731336563/c3a6cbc9-b128-473f-8.webp"],
        ["domclick-news","news","Журнал Домклик","https://blog.domclick.ru/novosti","https://static.tildacdn.com/tild3830-6530-4664-b036-363539633332/5f2ae62fba354ApkTake.png"],
        ["domrf-news","news","Дом РФ","https://спроси.дом.рф/news/","https://static.tildacdn.com/tild3237-3635-4335-b930-323861656132/e76f176a-df54-4d98-a.png"],
        ["krasdom","news","КРАСДОМ","https://krasdom.ru/Krasnodarskijj-krajj/news/","https://static.tildacdn.com/tild6337-3638-4535-a264-393339333230/apple-touch-icon.png"],
        ["93ru","news","93.RU","https://93.ru/text/realty/","https://static.tildacdn.com/tild3165-3137-4765-b830-336463363035/apple-favicon-180.png"],
        ["cian-news","news","ЦИАН Новости","https://krasnodar.cian.ru/novosti/","https://static.tildacdn.com/tild3462-6139-4438-a539-326563636434/01af2e378a7be5b095bb.jpeg"],
        ["yandex-news","news","Я.Новости","https://realty.yandex.ru/journal/category/news/","https://static.tildacdn.com/tild6332-3563-4266-b136-643237393564/i.jpg"],
        ["rbc","news","РБК","https://realty.rbc.ru/","https://static.tildacdn.com/tild3263-6266-4339-b531-636262653136/803.jpg"],
        ["ria","news","РИА-Новости","https://realty.ria.ru/","https://static.tildacdn.com/tild3938-6662-4437-b264-343531356661/i-2.jpg"],
        ["erz","news","ЕРЗ","https://erzrf.ru/news","https://static.tildacdn.com/tild3536-6662-4938-b764-376331343831/d6c15a3dc3b185d41e4a.jpg"],
        ["minstroy","news","Минстрой РФ","https://www.minstroyrf.gov.ru/press/?d=news","https://static.tildacdn.com/tild6136-6463-4239-b030-343339396335/vieapeascdvvbcgo12dg.jpg"],
        ["minfin","news","Минфин РФ","https://minfin.gov.ru/ru/press-center","https://static.tildacdn.com/tild3036-3866-4034-a432-323162616338/kgGJSMRRnAiIrrTkU9DC.webp"],
        ["banki","other","Банки.ру","https://banki.ru","https://static.rustore.ru/imgproxy/pe9FKhadeYUDwcpci4KZ6Y_FLgdVPFiukSzhFWu4UH0/preset:web_app_icon_160/plain/https://static.rustore.ru/apk/4428991/content/ICON/4822af97-bf02-4be0-a17b-5b42d379eaad.png@webp"],
        ["alfa-agent","other","Альфа АГЕНТ","https://agent.alfapolis.ru/lk","https://static.tildacdn.com/tild6236-3362-4032-b637-666132393462/91286ad1-537d-40f7-a.webp"],
        ["vk-ads","other","ВК Реклама","https://ads.vk.com/","https://static.tildacdn.com/tild3262-6538-4637-a534-663438613663/load-image.jpeg"],
        ["yandex-direct","other","Я.Директ","https://direct.yandex.ru/","https://static.tildacdn.com/tild6265-3632-4236-b262-363465303838/f_949679b2c907d6fe.jpg"],
        ["vitamin","other","Vitamin TOOLS","https://vitamin.tools/","https://static.tildacdn.com/tild3930-3335-4266-a530-323961383437/orig.png"],
        ["elama","other","eLama","https://elama.ru/","https://static.tildacdn.com/tild3335-3965-4365-a538-626563656335/unnamed.jpg"],
        ["metrika","other","Я.Метрика","https://metrika.yandex.ru/","https://static.tildacdn.com/tild3832-6237-4533-a536-306239386330/Widget_.png"],
        ["tilda","other","Tilda","https://tilda.ru/","https://static.tildacdn.com/tild3935-3934-4937-b765-333661626130/medium_d3ce47745d288.jpg"],
        ["regru","other","REG.ru","https://www.reg.ru/user/account/","https://static.tildacdn.com/tild6161-3634-4530-a335-393232366434/chat_avatar-568.jpg"],
        ["unisender","other","Unisender","https://cp.unisender.com/","https://static.tildacdn.com/tild6531-6565-4639-b165-646634396231/4246767.jpeg"],
        ["senler","other","Senler","https://senler.ru/","https://brands-prod.cdn-tinkoff.ru/general_logo/senler.png"],
        ["it-companies","links","Аккредитованные ИТ-компании","https://www.gosuslugi.ru/itorgs","https://play-lh.googleusercontent.com/dGLHLJqNX7K7wx-6qE3T_oK3txF33DF585KsQ4p5jf0UCUZ7QdjhS2lFyCfp9YtPbjYFUgnRDC-5Ml7XfSUKt1I=w480-h960-rw"],
        ["it-benefits","links","Проверка льгот ИТ-компании","https://www.gosuslugi.ru/ipoteka","https://play-lh.googleusercontent.com/dGLHLJqNX7K7wx-6qE3T_oK3txF33DF585KsQ4p5jf0UCUZ7QdjhS2lFyCfp9YtPbjYFUgnRDC-5Ml7XfSUKt1I=w480-h960-rw"],
        ["passport","links","Проверка Паспорта РФ","https://www.gosuslugi.ru/621102/1/form?_=1751032088093","https://play-lh.googleusercontent.com/dGLHLJqNX7K7wx-6qE3T_oK3txF33DF585KsQ4p5jf0UCUZ7QdjhS2lFyCfp9YtPbjYFUgnRDC-5Ml7XfSUKt1I=w480-h960-rw"],
        ["rosreestr","links","База данных Росреестра","https://lk.rosreestr.ru/eservices","https://static.tildacdn.com/tild6338-3762-4131-b435-333661363036/688cbf2af0323.webp"],
        ["fssp-ip","links","Банк данных исп. производств","https://fssp.gov.ru/iss/ip","https://play-lh.googleusercontent.com/r8t4dmmRxasOT6KNGWiNH6OsKEQDT4VGLXLwrb2QvlmPcNhVPZZt3wpZM_pxrlD4ehQ=w480-h960-rw"],
        ["fssp-search","links","Реестр розыска по исп. производствам","https://fssp.gov.ru/iss/ip_search","https://play-lh.googleusercontent.com/r8t4dmmRxasOT6KNGWiNH6OsKEQDT4VGLXLwrb2QvlmPcNhVPZZt3wpZM_pxrlD4ehQ=w480-h960-rw"],
        ["fssp-alim","links","Реестр должников по алиментам","https://fssp.gov.ru/ip_alim","https://play-lh.googleusercontent.com/r8t4dmmRxasOT6KNGWiNH6OsKEQDT4VGLXLwrb2QvlmPcNhVPZZt3wpZM_pxrlD4ehQ=w480-h960-rw"],
        ["fssp-suspect","links","Реестр лиц, находящихся в розыске","https://fssp.gov.ru/iss/suspect_info","https://play-lh.googleusercontent.com/r8t4dmmRxasOT6KNGWiNH6OsKEQDT4VGLXLwrb2QvlmPcNhVPZZt3wpZM_pxrlD4ehQ=w480-h960-rw"],
        ["kad","links","Проверка наличия арбитражных дел","https://kad.arbitr.ru/","https://static.tildacdn.com/tild3134-3466-4165-a365-666261366134/i.webp"],
        ["court","links","Проверка наличия судебных производств","https://xn--90afdbaav0bd1afy6eub5d.xn--p1ai/","https://static.tildacdn.com/tild3134-3466-4165-a365-666261366134/i.webp"],
        ["bankrupt","links","Реестр банкротов","https://bankrot.fedresurs.ru/","https://static.tildacdn.com/tild6335-3261-4032-b339-636539396431/i_1.webp"],
        ["extremists","links","Реестр экстремистов","https://fedsfm.ru/documents/terr-list","https://static.tildacdn.com/tild6663-3834-4965-a436-633533633230/i_2.webp"],
        ["powers","links","Реестр доверенностей","https://www.reestr-dover.ru/","https://static.tildacdn.com/tild6662-3031-4332-b963-623764356462/cd4a1687570c4d6abda9.webp"],
        ["pledges","links","Реестр залогового движимого имущества","https://www.reestr-zalogov.ru/search/index","https://static.tildacdn.com/tild6662-3031-4332-b963-623764356462/cd4a1687570c4d6abda9.webp"],
        ["inheritance","links","Реестр наследственных дел","https://notariat.ru/ru-ru/help/probate-cases/","https://static.tildacdn.com/tild6662-3031-4332-b963-623764356462/cd4a1687570c4d6abda9.webp"]
    ];

    const services = servicesData.map(([id, category, title, url, icon]) => ({ id, category, title, url, icon }));

    const $ = selector => document.querySelector(selector);

    function escapeHTML(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function getCategory(id) {
        return categories.find(item => item.id === id);
    }

    function getService(id) {
        return services.find(item => item.id === id);
    }

    function icon(name) {
        const icons = {
            tool: `<svg viewBox="0 0 24 24" fill="none"><path d="M14.5 5.5L18.5 9.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M13 7L5 15L4 20L9 19L17 11" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M16 4L20 8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
            building: `<svg viewBox="0 0 24 24" fill="none"><path d="M5 21V5L14 3V21" stroke="currentColor" stroke-width="1.7"/><path d="M14 9H19V21" stroke="currentColor" stroke-width="1.7"/><path d="M8 8H10M8 12H10M8 16H10" stroke="currentColor" stroke-width="1.7"/></svg>`,
            globe: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.7"/><path d="M4 12H20" stroke="currentColor" stroke-width="1.4"/><path d="M12 4C14 6.2 15 8.8 15 12C15 15.2 14 17.8 12 20" stroke="currentColor" stroke-width="1.4"/><path d="M12 4C10 6.2 9 8.8 9 12C9 15.2 10 17.8 12 20" stroke="currentColor" stroke-width="1.4"/></svg>`,
            check: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.7"/><path d="M8 12L10.7 14.7L16.5 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
            map: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 6L9 4L15 6L20 4V18L15 20L9 18L4 20V6Z" stroke="currentColor" stroke-width="1.6"/><path d="M9 4V18M15 6V20" stroke="currentColor" stroke-width="1.4"/></svg>`,
            file: `<svg viewBox="0 0 24 24" fill="none"><path d="M7 3H14L19 8V21H7V3Z" stroke="currentColor" stroke-width="1.7"/><path d="M14 3V8H19" stroke="currentColor" stroke-width="1.7"/><path d="M10 12H16M10 16H16" stroke="currentColor" stroke-width="1.5"/></svg>`,
            share: `<svg viewBox="0 0 24 24" fill="none"><circle cx="6" cy="12" r="2.5" stroke="currentColor" stroke-width="1.6"/><circle cx="18" cy="6" r="2.5" stroke="currentColor" stroke-width="1.6"/><circle cx="18" cy="18" r="2.5" stroke="currentColor" stroke-width="1.6"/><path d="M8.2 10.8L15.7 7.2M8.2 13.2L15.7 16.8" stroke="currentColor" stroke-width="1.6"/></svg>`,
            spark: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 3L13.8 8.2L19 10L13.8 11.8L12 17L10.2 11.8L5 10L10.2 8.2L12 3Z" stroke="currentColor" stroke-width="1.7"/><path d="M19 16L19.7 18.3L22 19L19.7 19.7L19 22L18.3 19.7L16 19L18.3 18.3L19 16Z" stroke="currentColor" stroke-width="1.4"/></svg>`,
            grid: `<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.6"/><rect x="14" y="4" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.6"/><rect x="4" y="14" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.6"/><rect x="14" y="14" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.6"/></svg>`,
            news: `<svg viewBox="0 0 24 24" fill="none"><path d="M5 5H19V19H5V5Z" stroke="currentColor" stroke-width="1.6"/><path d="M8 9H16M8 12H16M8 15H13" stroke="currentColor" stroke-width="1.5"/></svg>`,
            more: `<svg viewBox="0 0 24 24" fill="none"><circle cx="6" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="18" cy="12" r="1.5" fill="currentColor"/></svg>`,
            link: `<svg viewBox="0 0 24 24" fill="none"><path d="M9.5 14.5L14.5 9.5" stroke="currentColor" stroke-width="1.7"/><path d="M7.5 17.5L5.8 19.2C4.2 20.8 1.5 19.8 1.5 17.5C1.5 16.8 1.8 16.1 2.3 15.6L6.5 11.4C8 9.9 10.4 9.9 11.9 11.4" stroke="currentColor" stroke-width="1.7"/><path d="M16.5 6.5L18.2 4.8C19.8 3.2 22.5 4.2 22.5 6.5C22.5 7.2 22.2 7.9 21.7 8.4L17.5 12.6C16 14.1 13.6 14.1 12.1 12.6" stroke="currentColor" stroke-width="1.7"/></svg>`,
            star: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 3.5L14.7 8.9L20.7 9.8L16.3 14L17.3 20L12 17.2L6.7 20L7.7 14L3.3 9.8L9.3 8.9L12 3.5Z" stroke="currentColor" stroke-width="1.6"/></svg>`,
            arrow: `<svg viewBox="0 0 24 24" fill="none"><path d="M5 12H19M13 6L19 12L13 18" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
            trash: `<svg viewBox="0 0 24 24" fill="none"><path d="M5 7H19M9 7V4H15V7M7 7L8 20H16L17 7" stroke="currentColor" stroke-width="1.6"/></svg>`
        };
        return icons[name] || "";
    }

    function readJSON(key, fallback) {
        try {
            const value = JSON.parse(localStorage.getItem(key));
            return value ?? fallback;
        } catch (error) {
            return fallback;
        }
    }

    function loadPinned() {
        let pinned = readJSON(PINNED_KEY, []);
        if (!Array.isArray(pinned)) pinned = [];
        pinned = [...new Set(pinned.filter(Boolean).map(String))];
        if (localStorage.getItem(PINS_MIGRATED_KEY) !== "1") {
            const migrated = [];
            const oldHistory = readJSON(OLD_STORAGE_KEY, []);
            if (Array.isArray(oldHistory)) {
                oldHistory.forEach(item => {
                    if (!item?.pinned) return;
                    const service = services.find(service => service.url === item.link);
                    if (service) migrated.push(service.id);
                });
            }
            pinned = [...new Set([...pinned, ...migrated])];
            localStorage.setItem(PINNED_KEY, JSON.stringify(pinned));
            localStorage.setItem(PINS_MIGRATED_KEY, "1");
        }
        return pinned;
    }

    function savePinned(items) {
        pinnedIds = [...new Set(items.filter(Boolean).map(String))];
        localStorage.setItem(PINNED_KEY, JSON.stringify(pinnedIds));
    }

    function loadQuickOrder() {
        const order = readJSON(QUICK_ORDER_KEY, []);
        return Array.isArray(order) ? [...new Set(order.filter(Boolean).map(String))] : [];
    }

    function saveQuickOrder() {
        localStorage.setItem(QUICK_ORDER_KEY, JSON.stringify(quickOrder));
    }

    let pinnedIds = loadPinned();
    let quickOrder = loadQuickOrder();

    function isPinned(id) {
        return pinnedIds.includes(id);
    }

    function rememberInQuickOrder(id) {
        if (!id) return;
        if (!quickOrder.includes(id)) {
            quickOrder.push(id);
            saveQuickOrder();
        }
    }

    function quickOrderIndex(id) {
        const index = quickOrder.indexOf(id);
        return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    }

    function sortByQuickOrder(items) {
        return [...items].sort((a, b) => quickOrderIndex(a.id) - quickOrderIndex(b.id));
    }

    function loadHistory() {
        let loaded = readJSON(STORAGE_KEY, []);
        if (!Array.isArray(loaded)) loaded = [];
        if (!loaded.length) {
            const old = readJSON(OLD_STORAGE_KEY, []);
            if (Array.isArray(old) && old.length) {
                loaded = old.map(item => {
                    const service = services.find(service => service.url === item.link);
                    return {
                        id: service?.id || "old-" + Date.now() + Math.random(),
                        url: item.link || "",
                        title: service?.title || item.title || "Сервис",
                        icon: service?.icon || item.image || "",
                        category: service?.category || "",
                        clicks: Number(item.clicks) || 1,
                        lastOpen: Number(item.lastOpen) || Date.now()
                    };
                }).filter(item => item.url);
                saveHistory(loaded);
            }
        }
        const now = Date.now();
        loaded = loaded.filter(item => !item.lastOpen || now - item.lastOpen < HISTORY_TTL)
                       .filter(item => item.id && item.url);
        loaded.sort((a, b) => (b.lastOpen || 0) - (a.lastOpen || 0));
        return loaded.slice(0, MAX_HISTORY);
    }

    function saveHistory(items) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)));
    }

    let history = loadHistory();

    function recordOpen(service) {
        if (!service) return;
        const now = Date.now();
        const existing = history.find(item => item.id === service.id);
        if (existing) {
            existing.clicks = (existing.clicks || 0) + 1;
            existing.lastOpen = now;
            existing.title = service.title;
            existing.icon = service.icon;
            existing.url = service.url;
            existing.category = service.category;
        } else {
            history.unshift({
                id: service.id,
                url: service.url,
                title: service.title,
                icon: service.icon,
                category: service.category,
                clicks: 1,
                lastOpen: now
            });
        }
        rememberInQuickOrder(service.id);
        history = history.filter(item => now - item.lastOpen < HISTORY_TTL)
                         .sort((a, b) => (b.lastOpen || 0) - (a.lastOpen || 0))
                         .slice(0, MAX_HISTORY);
        saveHistory(history);
        renderAll();
    }

    function removeHistory(id) {
        history = history.filter(item => item.id !== id);
        saveHistory(history);
        renderAll();
    }

    function clearHistory() {
        history = [];
        saveHistory(history);
        renderAll();
    }

    function togglePin(id) {
        if (!getService(id)) return;
        if (isPinned(id)) {
            pinnedIds = pinnedIds.filter(itemId => itemId !== id);
            savePinned(pinnedIds);
            showToast("Сервис откреплен");
        } else {
            pinnedIds.push(id);
            savePinned(pinnedIds);
            rememberInQuickOrder(id);
            showToast("Сервис закреплен");
        }
        renderAll();
    }

    function getQuickServices() {
        const pinned = services.filter(service => isPinned(service.id));
        const popular = [...history].filter(item => !isPinned(item.id))
                                    .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
                                    .map(item => getService(item.id))
                                    .filter(Boolean);
        const result = [];
        [...sortByQuickOrder(pinned), ...popular, ...services].forEach(service => {
            if (service && result.length < 9 && !result.some(item => item.id === service.id)) {
                result.push(service);
            }
        });
        return result;
    }

    function serviceCard(service) {
        const category = getCategory(service.category);
        const pinned = isPinned(service.id);
        return `
            <a class="ue-service-card ${pinned ? "is-pinned" : ""}" href="${escapeHTML(service.url)}" target="_blank" rel="noopener noreferrer" data-service-id="${escapeHTML(service.id)}" data-quick-id="${escapeHTML(service.id)}" draggable="true">
                <div class="ue-service-icon"><img src="${escapeHTML(service.icon)}" alt="" loading="lazy"></div>
                <div class="ue-service-info">
                    <div class="ue-service-title">${escapeHTML(service.title)}</div>
                    <div class="ue-service-category">${escapeHTML(category?.title || "")}</div>
                </div>
                <button class="ue-star ${pinned ? "is-active" : ""}" type="button" data-pin="${escapeHTML(service.id)}" aria-label="${pinned ? "Открепить" : "Закрепить"}">${icon("star")}</button>
            </a>
        `;
    }

    function renderQuick() {
        const container = $("#ue-quick-grid");
        if (!container) return;
        container.innerHTML = getQuickServices().map(service => serviceCard(service)).join("");
    }

    function renderCategories() {
        const container = $("#ue-category-grid");
        const bannerContainer = $("#ue-developers-banner-container"); // Контейнер для широкого баннера застройщиков внизу
        
        if (!container) return;

        // 1. Фильтруем и рендерим обычные категории (все, кроме застройщиков)
        const regularCategories = categories.filter(category => category.id !== "developers");
        container.innerHTML = regularCategories.map(category => {
            const count = services.filter(service => service.category === category.id).length;
            return `
                <div class="ue-category" data-category="${category.id}" style="--category-color:${category.color}">
                    <div class="ue-category-top">
                        <div class="ue-category-icon">${icon(category.icon)}</div>
                        <div class="ue-category-count">${count}</div>
                    </div>
                    <div class="ue-category-title">${escapeHTML(category.title)}</div>
                    <div class="ue-category-sub">${escapeHTML(category.description)}</div>
                    <div class="ue-category-arrow">${icon("arrow")}</div>
                </div>
            `;
        }).join("");

        // 2. Отдельно рендерим карточку «Застройщики» на всю ширину (если контейнер существует)
        if (bannerContainer) {
            const devCategory = categories.find(category => category.id === "developers");
            if (devCategory) {
                const count = developersDirectoryLoaded ? developersDirectoryItems.length : "MAX";
                bannerContainer.innerHTML = `
                    <div class="ue-developers-banner" data-category="developers" style="--category-color:${devCategory.color}">
                        <div class="ue-developers-banner-left">
                            <div class="ue-developers-banner-icon">${icon(devCategory.icon)}</div>
                            <div>
                                <div class="ue-developers-banner-title">${escapeHTML(devCategory.title)}</div>
                                <div class="ue-developers-banner-sub">${escapeHTML(devCategory.description)}</div>
                            </div>
                        </div>
                        <div class="ue-developers-banner-right">
                            <span class="ue-developers-banner-count">${count}</span>
                            <div class="ue-developers-banner-arrow">${icon("arrow")}</div>
                        </div>
                    </div>
                `;
            }
        }
    }

    function renderFrequent() {
        const container = $("#ue-frequent-list");
        if (!container) return;
        const limit = window.innerWidth <= 480 ? 12 : 10;
        const frequent = [...history].sort((a, b) => (b.clicks || 0) - (a.clicks || 0)).slice(0, limit);
        if (!frequent.length) {
            container.innerHTML = `<div class="ue-empty">Откройте несколько сервисов — здесь появятся самые частые.</div>`;
            return;
        }
        container.innerHTML = frequent.map(item => {
            const pinned = isPinned(item.id);
            return `
                <div class="ue-side-item">
                    <a href="${escapeHTML(item.url)}" target="_blank" rel="noopener noreferrer" data-service-id="${escapeHTML(item.id)}" style="display:flex;align-items:center;min-width:0;flex:1">
                        <div class="ue-side-item-icon"><img src="${escapeHTML(item.icon)}" alt="" loading="lazy"></div>
                        <div class="ue-side-item-info">
                            <div class="ue-side-item-title">${escapeHTML(item.title)}</div>
                            <div class="ue-side-item-meta">${item.clicks || 1} открытий</div>
                        </div>
                    </a>
                    <button class="ue-side-pin ${pinned ? "is-active" : ""}" type="button" data-pin="${escapeHTML(item.id)}">${icon("star")}</button>
                </div>
            `;
        }).join("");
    }

    function formatDate(timestamp) {
        if (!timestamp) return "";
        const date = new Date(timestamp);
        const diff = Date.now() - date.getTime();
        const minute = 60 * 1000;
        const hour = 60 * minute;
        const day = 24 * hour;
        if (diff < minute) return "только что";
        if (diff < hour) return Math.floor(diff / minute) + " мин назад";
        if (diff < day) return Math.floor(diff / hour) + " ч назад";
        if (diff < 7 * day) return Math.floor(diff / day) + " дн назад";
        return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    }

    function renderHistory() {
        const container = $("#ue-history-list");
        if (!container) return;
        const items = [...history].sort((a, b) => (b.lastOpen || 0) - (a.lastOpen || 0)).slice(0, 5);
        if (!items.length) {
            container.innerHTML = `<div class="ue-empty">История пока пустая</div>`;
            return;
        }
        container.innerHTML = items.map(item => {
            const pinned = isPinned(item.id);
            return `
                <div class="ue-side-item">
                    <a href="${escapeHTML(item.url)}" target="_blank" rel="noopener noreferrer" data-service-id="${escapeHTML(item.id)}" style="display:flex;align-items:center;min-width:0;flex:1">
                        <div class="ue-side-item-icon"><img src="${escapeHTML(item.icon)}" alt=""></div>
                        <div class="ue-side-item-info">
                            <div class="ue-side-item-title">${escapeHTML(item.title)}</div>
                            <div class="ue-side-item-meta">${formatDate(item.lastOpen)}</div>
                        </div>
                    </a>
                    <button class="ue-side-pin ${pinned ? "is-active" : ""}" type="button" data-pin="${escapeHTML(item.id)}">${icon("star")}</button>
                </div>
            `;
        }).join("");
    }

    function openHistoryModal() {
        const modal = $("#ue-history-modal");
        const container = $("#ue-history-modal-list");
        if (!history.length) {
            container.innerHTML = `<div class="ue-empty">История пока пустая</div>`;
        } else {
            container.innerHTML = [...history].sort((a, b) => (b.lastOpen || 0) - (a.lastOpen || 0)).map(item => `
                <div class="ue-history-row">
                    <div class="ue-history-row-icon"><img src="${escapeHTML(item.icon)}" alt=""></div>
                    <div class="ue-history-row-info">
                        <div class="ue-history-row-title">${escapeHTML(item.title)}</div>
                        <div class="ue-history-row-meta">${item.clicks || 1} открытий · ${formatDate(item.lastOpen)}</div>
                    </div>
                    <div class="ue-history-actions">
                        <button class="ue-history-action ${isPinned(item.id) ? "active" : ""}" type="button" data-pin="${escapeHTML(item.id)}">${icon("star")}</button>
                        <button class="ue-history-action" type="button" data-remove-history="${escapeHTML(item.id)}">${icon("trash")}</button>
                    </div>
                </div>
            `).join("");
        }
        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
    }

    function closeHistoryModal() {
        const modal = $("#ue-history-modal");
        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
    }

    function openCategory(id) {
        if (id === "developers") {
            openDevelopersDirectory();
            return;
        }
        const category = getCategory(id);
        if (!category) return;
        const modal = $("#ue-category-modal");
        const title = $("#ue-modal-title");
        const subtitle = $("#ue-modal-subtitle");
        const modalIcon = $("#ue-modal-category-icon");
        const grid = $("#ue-modal-grid");
        const items = services.filter(service => service.category === id);
        modalIcon.innerHTML = icon(category.icon);
        modalIcon.style.color = category.color;
        title.textContent = category.title;
        subtitle.textContent = `${items.length} сервисов · ${category.description}`;
        grid.innerHTML = items.map(service => `
            <div class="ue-modal-service">
                <a href="${escapeHTML(service.url)}" target="_blank" rel="noopener noreferrer" data-service-id="${escapeHTML(service.id)}" style="display:flex;align-items:center;min-width:0;flex:1">
                    <div class="ue-modal-service-icon"><img src="${escapeHTML(service.icon)}" alt="" loading="lazy"></div>
                    <div class="ue-modal-service-info"><div class="ue-modal-service-title">${escapeHTML(service.title)}</div></div>
                </a>
                <button class="ue-modal-star ${isPinned(service.id) ? "is-active" : ""}" type="button" data-pin="${escapeHTML(service.id)}">${icon("star")}</button>
            </div>
        `).join("");
        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
    }

    function closeCategory() {
        const modal = $("#ue-category-modal");
        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
    }

    function renderSearch(query) {
        const container = $("#ue-search-results");
        if (!container) return;
        query = String(query || "").trim().toLowerCase();
        if (!query) {
            container.innerHTML = "";
            container.classList.remove("is-open");
            return;
        }
        const results = services.filter(service => {
            const category = getCategory(service.category);
            return service.title.toLowerCase().includes(query) || category?.title.toLowerCase().includes(query);
        }).slice(0, 10);
        if (!results.length) {
            container.innerHTML = `<div class="ue-empty">Ничего не найдено</div>`;
            container.classList.add("is-open");
            return;
        }
        container.innerHTML = results.map(service => {
            const category = getCategory(service.category);
            return `
                <a class="ue-search-result" href="${escapeHTML(service.url)}" target="_blank" rel="noopener noreferrer" data-service-id="${escapeHTML(service.id)}">
                    <div class="ue-search-result-icon"><img src="${escapeHTML(service.icon)}" alt=""></div>
                    <div class="ue-search-result-info">
                        <div class="ue-search-result-title">${escapeHTML(service.title)}</div>
                        <div class="ue-search-result-category">${escapeHTML(category?.title || "")}</div>
                    </div>
                </a>
            `;
        }).join("");
        container.classList.add("is-open");
    }

    function openAI() {
        document.dispatchEvent(new CustomEvent("urban-estate:open-ai"));
    }

    let toastTimer;
    function showToast(message) {
        const toast = $("#ue-toast");
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add("is-visible");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toast.classList.remove("is-visible");
        }, 2200);
    }

    const KEY_RATE_API_URL = "https://urban-estate-news-test.vercel.app/api/key-rate";
    const KEY_RATE_CACHE_KEY = "ueKeyRateCacheV1";

    function keyRateRender(data, stale) {
        const valueEl = $("#ue-key-rate-value");
        const dateEl = $("#ue-key-rate-date");
        const stateEl = $("#ue-key-rate-state");
        if (!valueEl || !dateEl || !stateEl || !data || !data.rate) return;
        valueEl.classList.remove("ue-key-rate-skeleton");
        valueEl.removeAttribute("aria-label");
        valueEl.textContent = String(data.rate).replace(".", ",");
        dateEl.textContent = data.date ? "На " + data.date : "Дата не указана";
        stateEl.classList.toggle("is-error", Boolean(stale));
        stateEl.textContent = stale ? "Не удалось обновить · показаны последние сохранённые данные" : "Актуальные данные · обновляются автоматически";
    }

    async function initKeyRateWidget() {
        const card = $("#ue-key-rate-card");
        if (!card) return;
        let cached = null;
        try { cached = JSON.parse(localStorage.getItem(KEY_RATE_CACHE_KEY) || "null"); } catch (e) {}
        if (cached && cached.rate) keyRateRender(cached, true);
        try {
            const response = await fetch(KEY_RATE_API_URL, { method: "GET", headers: { "Accept": "application/json" }, cache: "no-store" });
            if (!response.ok) throw new Error("HTTP " + response.status);
            const data = await response.json();
            if (!data || data.ok !== true || !data.rate || !data.date) throw new Error("Некорректный ответ API");
            keyRateRender(data, false);
            try {
                localStorage.setItem(KEY_RATE_CACHE_KEY, JSON.stringify({ rate: data.rate, date: data.date, fetchedAt: Date.now() }));
            } catch (e) {}
        } catch (error) {
            console.error("Urban Estate Key Rate:", error);
            if (!cached || !cached.rate) {
                const valueEl = $("#ue-key-rate-value");
                const dateEl = $("#ue-key-rate-date");
                const stateEl = $("#ue-key-rate-state");
                if (valueEl) { valueEl.classList.remove("ue-key-rate-skeleton"); valueEl.textContent = "—"; }
                if (dateEl) dateEl.textContent = "Данные временно недоступны";
                if (stateEl) { stateEl.textContent = "Проверьте подключение позже"; stateEl.classList.add("is-error"); }
            }
        }
    }

    const NEWS_API_URL = "https://urban-estate-news-test.vercel.app/api/news";
    const NEWS_LIMIT = 30;
    const NEWS_VISIBLE = 6;
    const NEWS_DAYS = 7;
    let currentNewsCategory = "all";
    let newsLoading = false;
    let newsAllItems = [];
    let newsExpanded = false;
    let newsInitialized = false;
    let newsRefreshTimer = null;

    function newsEscape(value) {
        return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    function newsStripHtml(value) {
        return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    }

    function newsFormatTime(item) {
        if (typeof item.age === "number") {
            if (item.age < 1) return "только что";
            if (item.age < 60) return item.age + " мин назад";
            const hours = Math.floor(item.age / 60);
            if (hours < 24) return hours + " ч назад";
            const days = Math.floor(hours / 24);
            return days === 1 ? "вчера" : days + " дн назад";
        }
        const value = item.publishedAt || item.published || item.date || "";
        if (!value) return "";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        const diff = Date.now() - date.getTime();
        const minute = 60 * 1000;
        const hour = 60 * minute;
        const day = 24 * hour;
        if (diff < minute) return "только что";
        if (diff < hour) return Math.floor(diff / minute) + " мин назад";
        if (diff < day) return Math.floor(diff / hour) + " ч назад";
        if (diff < 7 * day) return Math.floor(diff / day) + " дн назад";
        return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
    }

    function newsGetCategory(item) {
        if (item.topic) return item.topic;
        if (item.category === "krasnodar") return "Краснодар";
        if (item.category === "rostov") return "Ростов";
        if (currentNewsCategory !== "all") {
            const names = { "Ипотека и банки": "Ипотека и банки", "Недвижимость": "Недвижимость", "Новостройки": "Новостройки", "Законодательство": "Законодательство" };
            if (names[currentNewsCategory]) return names[currentNewsCategory];
        }
        return "Новости";
    }

    function newsImage(item) {
        const letter = String(item.sourceName || item.source || "Н").trim().slice(0, 1).toUpperCase();
        if (!item.image) {
            return `<div class="ue-news-image"><div class="ue-news-placeholder">${newsEscape(letter)}</div></div>`;
        }
        return `
            <div class="ue-news-image">
                <img src="${newsEscape(item.image)}" alt="" loading="lazy" onerror="this.style.display='none';const p=this.parentElement.querySelector('.ue-news-placeholder');if(p)p.style.display='flex';">
                <div class="ue-news-placeholder" style="display:none">${newsEscape(letter)}</div>
            </div>
        `;
    }

    function renderNews(items) {
        const grid = $("#ue-news-grid");
        const more = $("#ue-news-more");
        if (!grid) return;
        if (!Array.isArray(items) || !items.length) {
            grid.innerHTML = `<div class="ue-news-empty">По выбранной категории пока нет публикаций.</div>`;
            if (more) more.hidden = true;
            return;
        }

        // Если новостей меньше или равно порции (6 штук), скрываем кнопку вообще
        if (items.length <= NEWS_VISIBLE) {
            grid.innerHTML = items.map(item => buildNewsCard(item)).join("");
            if (more) more.hidden = true;
            return;
        }

        // Определяем, сколько новостей показывать в зависимости от текущего состояния
        // newsVisibleCount будет хранить текущее количество отображаемых карточек
        if (typeof window.newsVisibleCount !== "number" || window.newsVisibleCount < NEWS_VISIBLE) {
            window.newsVisibleCount = NEWS_VISIBLE;
        }

        const visibleItems = items.slice(0, window.newsVisibleCount);
        grid.innerHTML = visibleItems.map(item => buildNewsCard(item)).join("");

        if (more) {
            more.hidden = false;
            // Если открыты уже все новости, меняем текст кнопки на "Свернуть"
            if (window.newsVisibleCount >= items.length) {
                more.innerHTML = `Свернуть <span></span>`;
                more.classList.add("is-folded-state");
            } else {
                more.innerHTML = `Еще <span></span>`;
                more.classList.remove("is-folded-state");
            }
        }
    }

    // Вспомогательная функция для создания HTML одной карточки новости
    function buildNewsCard(item) {
        const title = newsEscape(item.title || "Без названия");
        const description = newsEscape(newsStripHtml(item.description));
        const source = newsEscape(item.sourceName || item.source || "Источник");
        const url = newsEscape(item.url || "#");
        const time = newsEscape(newsFormatTime(item));
        const category = newsEscape(newsGetCategory(item));
        return `
            <article class="ue-news-card">
                ${newsImage(item)}
                <div class="ue-news-card-body">
                    <div class="ue-news-meta"><span class="ue-news-source">${source}</span><span class="ue-news-time">${time}</span></div>
                    <a class="ue-news-title-link" href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>
                    ${description ? `<div class="ue-news-description">${description}</div>` : ""}
                    <div class="ue-news-bottom"><span class="ue-news-tag">${category}</span><span class="ue-news-open">Читать</span></div>
                </div>
            </article>
        `;
    }

    function newsPlural(count) {
        const n = Math.abs(count) % 100;
        const n1 = n % 10;
        if (n >= 11 && n <= 19) return "публикаций";
        if (n1 === 1) return "публикация";
        if (n1 >= 2 && n1 <= 4) return "публикации";
        return "публикаций";
    }

    function setNewsLoading(value) {
        newsLoading = value;
        const button = $("#ue-news-refresh");
        if (!button) return;
        button.disabled = value;
        button.classList.toggle("is-loading", value);
        button.textContent = value ? " Загрузка…" : " Обновить";
    }

    function setNewsStatus(text) {
        const element = $("#ue-news-status");
        if (element) element.textContent = text || "";
    }

    async function loadNews(category = currentNewsCategory) {
        if (newsLoading) return;
        currentNewsCategory = category;
        newsExpanded = false;
        setNewsLoading(true);
        setNewsStatus("Загрузка новостей…");
        const grid = $("#ue-news-grid");
        if (grid) grid.innerHTML = `<div class="ue-news-loading">Загрузка новостей…</div>`;
        const more = $("#ue-news-more");
        if (more) more.hidden = true;
        try {
            const params = new URLSearchParams({ category, limit: String(NEWS_LIMIT), days: String(NEWS_DAYS), v: String(Math.floor(Date.now() / 180000)) });
            const response = await fetch(`${NEWS_API_URL}?${params.toString()}`, { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (!data || data.ok !== true || !Array.isArray(data.items)) throw new Error("Некорректный ответ API");
            newsAllItems = data.items;
            renderNews(newsAllItems);
            const count = newsAllItems.length;
            setNewsStatus(`${count} ${newsPlural(count)}`);
        } catch (error) {
            console.error("Urban Estate News:", error);
            newsAllItems = [];
            if (grid) {
                grid.innerHTML = `
                    <div class="ue-news-error">
                        <div>Не удалось загрузить новости.</div>
                        <div>${newsEscape(error.message || "Ошибка API")}</div>
                        <button type="button" class="ue-news-retry" id="ue-news-retry">Повторить</button>
                    </div>
                `;
            }
            setNewsStatus("Ошибка загрузки");
            if (more) more.hidden = true;
            const retry = $("#ue-news-retry");
            if (retry) retry.addEventListener("click", () => loadNews(currentNewsCategory), { once: true });
        } finally {
            setNewsLoading(false);
        }
    }

    function initNews() {
        if (newsInitialized || !$("#ue-news-grid")) return;
        newsInitialized = true;
        
        // Сбрасываем счетчик при инициализации
        window.newsVisibleCount = NEWS_VISIBLE;

        document.querySelectorAll("[data-news-filter]").forEach(button => {
            button.addEventListener("click", function () {
                const category = this.dataset.newsFilter || "all";
                window.newsVisibleCount = NEWS_VISIBLE; // Сбрасываем при смене фильтра
                document.querySelectorAll("[data-news-filter]").forEach(item => {
                    item.classList.toggle("is-active", item === this);
                });
                loadNews(category);
            });
        });

        const refresh = $("#ue-news-refresh");
        if (refresh) refresh.addEventListener("click", () => {
            window.newsVisibleCount = NEWS_VISIBLE;
            loadNews(currentNewsCategory);
        });

        const more = $("#ue-news-more");
        if (more) {
            more.addEventListener("click", function () {
                // Если показаны уже все новости, по клику сворачиваем обратно до 6 и ПРОСТО РИСУЕМ (без скролла)
                if (window.newsVisibleCount >= newsAllItems.length) {
                    window.newsVisibleCount = NEWS_VISIBLE;
                    renderNews(newsAllItems);
                    // Автоскролл полностью удален, страница никуда не прыгает
                } else {
                    // Иначе добавляем по 6 новостей за раз
                    window.newsVisibleCount += NEWS_VISIBLE;
                    renderNews(newsAllItems);
                    // Автоскролл здесь также намеренно убран
                }
            });
        }

        loadNews("all");
        if (newsRefreshTimer) clearInterval(newsRefreshTimer);
        newsRefreshTimer = setInterval(() => {
            if (document.visibilityState !== "hidden") loadNews(currentNewsCategory);
        }, 600000);
    }

    const devText = value => String(value == null ? "" : value).trim();
    const devEscape = value => escapeHTML(devText(value));

    function devValue(item, keys) {
        for (const key of keys) {
            const value = item && item[key];
            if (value !== undefined && value !== null && value !== "") return value;
        }
        return "";
    }

    function devList(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        if (typeof value === "string") return value.split(/\n+/).map(x => x.trim()).filter(Boolean);
        return [value];
    }

    function devLinkItem(item) {
        if (typeof item === "string") return { title: item, url: item };
        return {
            title: devText(item.title || item.name || item.label || item.text || item.url || item.href || "Ссылка"),
            url: devText(item.url || item.href || item.link || "")
        };
    }

    function devSafeUrl(value) {
        const raw = devText(value);
        if (!raw) return "";
        try {
            const url = new URL(raw, window.location.origin);
            return ["http:", "https:", "tel:", "mailto:"].includes(url.protocol) ? url.href : "";
        } catch (_) { return ""; }
    }

    // Добавлена функция определения эмодзи по тексту ссылки
    function getDevEmoji(title, url) {
        const href = String(url || "").toLowerCase();
    
        // Telegram — синяя иконка независимо от текста ссылки
        if (href.includes("t.me")) return "🔵 ";
    
        const t = String(title || "").toLowerCase();
    
        if (t.includes("сайт")) return "🌐 ";
        if (t.includes("новости") || t.includes("группа")) return "🟣 ";
        if (t.includes("расчеты")) return "🟣 ";
        if (t.includes("бот")) return "🟣 ";
        if (t.includes("шахматка")) return "♟ ";
        if (t.includes("кабинет")) return "💼 ";
        if (t.includes("материалы")) return "🗂 ";
        if (t.includes("презентац")) return "🗂 "; 
        if (t.includes("фикс")) return "🔗 ";
        
        return "";
    }

    function devLinkMarkup(items) {
        const links = devList(items).map(devLinkItem).filter(x => x.url && devSafeUrl(x.url));
        if (!links.length) return "";
        return `<div class="ue-dev-links">${links.map(link => {
            const emoji = getDevEmoji(link.title, link.url);
            return `<a class="ue-dev-link" href="${devEscape(devSafeUrl(link.url))}" target="_blank" rel="noopener noreferrer">${emoji}${devEscape(link.title)}</a>`;
        }).join("")}</div>`;
    }

    function devSection(title, content) {
        if (!content) return "";
        return `<div class="ue-dev-section"><div class="ue-dev-section-title">${devEscape(title)}</div>${content}</div>`;
    }

    function devNormalize(raw) {
        const item = raw || {};
        return {
            id: devValue(item, ["id", "developerId", "messageId"]),
            name: devText(devValue(item, ["name", "title", "developer", "companyName"])) || "Застройщик",
            city: devText(devValue(item, ["city", "region", "location"])) || "Город не указан",
            category: devText(devValue(item, ["category", "type", "segment", "buildingType"])) || "Категория не указана",
            photo: devText(devValue(item, ["photo", "image", "avatar", "logo", "photoUrl", "imageUrl"])),
            groups: devValue(item, ["groups", "links", "websites", "groupLinks"]) || [],
            resources: devValue(item, ["resources", "materials", "files", "resourceLinks"]) || [],
            description: devText(devValue(item, ["description", "subtitle", "about"])),
            comment: devText(devValue(item, ["comment", "notes", "note"])),
            contacts: devValue(item, ["contacts", "managers", "manager", "contact"]) || []
        };
    }

    function devContactsMarkup(value) {
        const contacts = devList(value);
        if (!contacts.length) return "";
        return contacts.map(entry => {
            if (typeof entry === "string") {
                const phone = entry.match(/[+]?\d[\d\s()\-]{7,}\d/);
                const phoneText = phone ? phone[0].trim() : "";
                const href = phoneText ? `tel:${phoneText.replace(/[^+\d]/g, "")}` : "";
                return `<div class="ue-dev-contact">${href ? `<a href="${devEscape(href)}">${devEscape(phoneText)}</a>` : devEscape(entry)}</div>`;
            }
            const name = devText(entry.name || entry.fullName || entry.manager || "");
            const phones = devList(entry.phones || entry.phone || entry.telephone)
                .map(phone => devText(phone))
                .filter(Boolean);
            const email = devText(entry.email || "");
            
            const phoneMarkup = phones.map(phone => {
                const href = `tel:${phone.replace(/[^\d+]/g, "")}`;
                return `<div><a href="${devEscape(href)}">${devEscape(phone)}</a></div>`;
            }).join("");
            
            const emailMarkup = email
                ? `<div><a href="mailto:${devEscape(email)}">${devEscape(email)}</a></div>`
                : "";
            
            const nameMarkup = name
                ? `<div>${devEscape(name)}</div>`
                : "";
            
            return `<div class="ue-dev-contact">${phoneMarkup}${emailMarkup}${nameMarkup}</div>`;
        }).join("");
    }


    function renderDevelopersDirectory() {
        const list = $("#ue-dev-list");
        const status = $("#ue-dev-status");
        const subtitle = $("#ue-dev-subtitle");
        const search = devText($("#ue-dev-search")?.value).toLocaleLowerCase("ru-RU");
        const city = devText($("#ue-dev-city")?.value);
        const category = devText($("#ue-dev-category")?.value);
        if (!list) return;

        const filtered = developersDirectoryItems.filter(item =>
            (!search || item.name.toLocaleLowerCase("ru-RU").includes(search)) &&
            (!city || item.city === city) && (!category || item.category === category)
        );
        if (status) status.textContent = `Найдено: ${filtered.length}`;
        if (subtitle) subtitle.textContent = `${developersDirectoryItems.length} компаний в справочнике`;
        if (!filtered.length) {
            list.innerHTML = `<div class="ue-dev-empty">${developersDirectoryItems.length ? "По заданным фильтрам ничего не найдено" : "Список застройщиков пока пуст"}</div>`;
            return;
        }

        list.innerHTML = filtered.map(item => {
            const photo = item.photo && devSafeUrl(item.photo)
                ? `<img class="ue-dev-photo" src="${devEscape(devSafeUrl(item.photo))}" alt="" loading="lazy">`
                : `<div class="ue-dev-photo ue-dev-photo-placeholder"></div>`;
            const groups = devLinkMarkup(item.groups);
            const resources = devLinkMarkup(item.resources);
            const contacts = devContactsMarkup(item.contacts);
            return `
                <article class="ue-dev-card">
                    <div class="ue-dev-card-head">
                        ${photo}
                        <div>
                            <div class="ue-dev-name">${devEscape(item.name)}</div>
                            ${item.description ? `<div class="ue-dev-description">${devEscape(item.description)}</div>` : ""}
                            <div class="ue-dev-meta">
                                <span class="ue-dev-tag">${devEscape(item.city)}</span>
                                <span class="ue-dev-tag">${devEscape(item.category)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="ue-dev-body">
                        ${devSection("Сайты и группы", groups)}
                        ${devSection("Материалы и ресурсы", resources)}
                        ${devSection("Контакты", contacts)}
                        ${item.comment && item.comment.trim() ? `<hr class="ue-dev-divider"><div class="ue-dev-comment">${devEscape(item.comment)}</div>` : ""}
                    </div>
                </article>
            `;
        }).join("");
    }
    
    
    function updateDevelopersCategoryFilter(city, selectedCategory = "") {
        const categorySelect = $("#ue-dev-category");
        if (!categorySelect) return;
    
        const categoriesList = [
            ...new Set(
                developersDirectoryItems
                    .filter(item => !city || item.city === city)
                    .map(item => item.category)
                    .filter(category =>
                        category &&
                        category !== "Категория не указана"
                    )
            )
        ].sort((a, b) => a.localeCompare(b, "ru"));
    
        categorySelect.innerHTML =
            `<option value="">Все категории</option>` +
            categoriesList.map(category =>
                `<option value="${devEscape(category)}">${devEscape(category)}</option>`
            ).join("");
    
        // Сохраняем выбор, только если категория доступна в этом городе
        categorySelect.value = categoriesList.includes(selectedCategory)
            ? selectedCategory
            : "";
    }
    
    function fillDevelopersFilters() {
        const citySelect = $("#ue-dev-city");
        const categorySelect = $("#ue-dev-category");
    
        if (!citySelect || !categorySelect) return;
    
        const oldCity = citySelect.value;
        const oldCategory = categorySelect.value;
    
        const cities = [
            ...new Set(
                developersDirectoryItems
                    .map(item => item.city)
                    .filter(city => city && city !== "Город не указан")
            )
        ].sort((a, b) => a.localeCompare(b, "ru"));
    
        citySelect.innerHTML =
            `<option value="">Все города</option>` +
            cities.map(city =>
                `<option value="${devEscape(city)}">${devEscape(city)}</option>`
            ).join("");
    
        citySelect.value = cities.includes(oldCity) ? oldCity : "";
    
        updateDevelopersCategoryFilter(citySelect.value, oldCategory);
    }

    async function loadDevelopersDirectory() {
        if (developersDirectoryLoaded || developersDirectoryLoading) {
            renderDevelopersDirectory();
            return;
        }
        developersDirectoryLoading = true;
        const list = $("#ue-dev-list");
        const status = $("#ue-dev-status");
        if (status) status.textContent = "Загружаем справочник…";
        if (list) list.innerHTML = `<div class="ue-dev-empty">Загружаем застройщиков…</div>`;
        try {
            const response = await fetch("https://urban-estate-news-test.vercel.app/api/developers", { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const rows = Array.isArray(data) ? data : (data.developers || data.items || data.cards || data.data || []);
            if (!Array.isArray(rows)) throw new Error("API вернул список в неизвестном формате");
            developersDirectoryItems = rows.map(devNormalize);
            developersDirectoryLoaded = true;
            fillDevelopersFilters();
            renderDevelopersDirectory();
            const bannerCount = document.querySelector('.ue-developers-banner-count');
            if (bannerCount) bannerCount.textContent = `${developersDirectoryItems.length}`;
        } catch (error) {
            console.error("Urban Estate Developers:", error);
            if (status) status.textContent = "Не удалось загрузить список";
            if (list) list.innerHTML = `<div class="ue-dev-empty">Не удалось загрузить застройщиков. Проверьте доступность /api/developers и обновите страницу.</div>`;
        } finally {
            developersDirectoryLoading = false;
        }
    }

    function openDevelopersDirectory() {
        const modal = $("#ue-developers-modal");
        if (!modal) return;
        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
        loadDevelopersDirectory();
    }

    function closeDevelopersDirectory() {
        const modal = $("#ue-developers-modal");
        if (!modal) return;
        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");
        if (!$("#ue-category-modal")?.classList.contains("is-open") && !$("#ue-history-modal")?.classList.contains("is-open")) document.body.style.overflow = "";
    }

    $("#ue-dev-close")?.addEventListener("click", closeDevelopersDirectory);
    $("#ue-developers-modal")?.addEventListener("click", event => {
        if (event.target === event.currentTarget) closeDevelopersDirectory();
    });
    
    $("#ue-dev-search")?.addEventListener(
        "input",
        renderDevelopersDirectory
    );
    
    $("#ue-dev-city")?.addEventListener("change", () => {
        const categorySelect = $("#ue-dev-category");
        const selectedCategory = categorySelect?.value || "";
        const selectedCity = $("#ue-dev-city")?.value || "";
    
        updateDevelopersCategoryFilter(selectedCity, selectedCategory);
        renderDevelopersDirectory();
    });
    
    $("#ue-dev-category")?.addEventListener(
        "change",
        renderDevelopersDirectory
    );

    function renderAll() {
        history = loadHistory();
        renderQuick();
        renderCategories();
        renderFrequent();
        renderHistory();
        initNews();
    }
    
    // Обработка клика по карточке застройщика (скрытие/раскрытие)
    document.addEventListener("click", function (event) {
        const card = event.target.closest(".ue-dev-card");
        // Если кликнули по ссылке или кнопке внутри карточки — не сворачиваем/не разворачиваем карточку целиком
        if (event.target.closest("a") || event.target.closest("button")) return;
        if (card) {
            card.classList.toggle("is-expanded");
        }
    });

    document.addEventListener("click", function (event) {
        const pin = event.target.closest("[data-pin]");
        if (pin) {
            event.preventDefault();
            event.stopPropagation();
            togglePin(pin.dataset.pin);
            return;
        }
        const remove = event.target.closest("[data-remove-history]");
        if (remove) {
            event.preventDefault();
            removeHistory(remove.dataset.removeHistory);
            openHistoryModal();
            return;
        }
        const category = event.target.closest("[data-category]");
        if (category) {
            openCategory(category.dataset.category);
            return;
        }
        const serviceLink = event.target.closest("[data-service-id]");
        if (serviceLink && !event.target.closest("[data-pin]")) {
            const service = getService(serviceLink.dataset.serviceId);
            if (service) recordOpen(service);
            return;
        }
        const aiButton = event.target.closest("[data-ue-ai]");
        if (aiButton) {
            event.preventDefault();
            openAI();
            return;
        }
        if (event.target.closest("#ue-modal-close")) {
            closeCategory();
            return;
        }
        if (event.target.closest("[data-ue-open-history]")) {
            openHistoryModal();
            return;
        }
        if (event.target.closest("[data-ue-close-history]")) {
            closeHistoryModal();
            return;
        }
        if (event.target.closest("#ue-clear-history")) {
            clearHistory();
            showToast("История очищена");
            return;
        }
    });

    let draggedQuickId = null;
    const quickGrid = $("#ue-quick-grid");

    if (quickGrid) {
        quickGrid.addEventListener("dragstart", function (event) {
            const card = event.target.closest("[data-quick-id]");
            if (!card) return;
            draggedQuickId = card.dataset.quickId;
            card.classList.add("is-dragging");
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", draggedQuickId);
            }
        });

        quickGrid.addEventListener("dragend", function () {
            quickGrid.querySelectorAll(".is-dragging,.is-drag-over").forEach(item => {
                item.classList.remove("is-dragging", "is-drag-over");
            });
            draggedQuickId = null;
        });

        quickGrid.addEventListener("dragover", function (event) {
            const card = event.target.closest("[data-quick-id]");
            if (!card || !draggedQuickId || card.dataset.quickId === draggedQuickId) return;
            if (isPinned(draggedQuickId) !== isPinned(card.dataset.quickId)) return;
            event.preventDefault();
            quickGrid.querySelectorAll(".is-drag-over").forEach(item => item.classList.remove("is-drag-over"));
            card.classList.add("is-drag-over");
        });

        quickGrid.addEventListener("drop", function (event) {
            const card = event.target.closest("[data-quick-id]");
            if (!card || !draggedQuickId) return;
            const targetId = card.dataset.quickId;
            if (targetId === draggedQuickId) return;
            if (isPinned(draggedQuickId) !== isPinned(targetId)) return;
            event.preventDefault();
            const current = getQuickServices().map(item => item.id);
            const sameGroup = current.filter(id => isPinned(id) === isPinned(draggedQuickId));
            const from = sameGroup.indexOf(draggedQuickId);
            const to = sameGroup.indexOf(targetId);
            if (from === -1 || to === -1) return;
            const reordered = [...sameGroup];
            const moved = reordered.splice(from, 1)[0];
            reordered.splice(to, 0, moved);
            const other = quickOrder.filter(id => isPinned(id) !== isPinned(draggedQuickId));
            quickOrder = isPinned(draggedQuickId) ? [...reordered, ...other] : [...other, ...reordered];
            saveQuickOrder();
            renderQuick();
        });
    }

    const searchInput = $("#ue-search-input");
    if (searchInput) {
        searchInput.addEventListener("input", function () {
            renderSearch(this.value);
        });
        searchInput.addEventListener("focus", function () {
            if (this.value.trim()) {
                renderSearch(this.value);
            }
        });
    }

    document.addEventListener("keydown", function (event) {
        if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
            event.preventDefault();
        }
        if (event.key === "Escape") {
            closeCategory();
            closeHistoryModal();
            closeDevelopersDirectory();
            $("#ue-search-results")?.classList.remove("is-open");
        }
    });

    $("#ue-category-modal")?.addEventListener("click", function (event) {
        if (event.target === this) closeCategory();
    });

    $("#ue-history-modal")?.addEventListener("click", function (event) {
        if (event.target === this) closeHistoryModal();
    });

    document.addEventListener("click", function (event) {
        if (!event.target.closest(".ue-search") && !event.target.closest("#ue-search-results")) {
            $("#ue-search-results")?.classList.remove("is-open");
        }
    });

    const MORTGAGE_RATES_API_URL = "https://urban-estate-news-test.vercel.app/api/mortgage-rates";
    const MORTGAGE_RATES_CACHE_KEY = "ueMortgageRatesCacheV1";

    function mortgageRatesRender(data, cacheFallback) {
        const list = $("#ue-mortgage-list");
        const state = $("#ue-mortgage-state");
        if (!list || !state || !data || !Array.isArray(data.banks)) return;
        list.textContent = "";
        const banks = data.banks.slice().sort((a, b) => Number(a.rateValue) - Number(b.rateValue));
        
        // Словарь индивидуальных ссылок на ИЗОБРАЖЕНИЯ ЛОГОТИПОВ для каждого банка
        const customLogosMap = {
            "sberbank": "https://static.rustore.ru/imgproxy/qriFjN8OV6VBF4CCbWcxPm7SL0Y0YtMfxTeJSzWZ1Rc/preset:web_app_icon_160/plain/https://static.rustore.ru/apk/462271/content/ICON/f1b3c68a-b734-48ce-b62f-490208d3fa0e.png@webp",
            "vtb": "https://static.rustore.ru/imgproxy/lzg_3CHk-oqIqIfBj0KFQ-vhwK6NUJk6qC1r1Lt0fKM/preset:web_app_icon_160/plain/https://static.rustore.ru/2026/3/28/37/apk/404415/content/ICON/577a3521-f7ef-4322-ab3c-c96b9262c562.png@webp",
            "alfa": "https://static.rustore.ru/imgproxy/FjgsClgg0crUVE9DiaueyRVtmQQMrZ7fYyNh88Gedq0/preset:web_app_icon_160/plain/https://static.rustore.ru/afb07f02-5399-4f45-a366-e49a7b3420ad@webp",
            "sovcom": "https://static.rustore.ru/imgproxy/JXhc0qQksx2nuR0RrBL6lcBru2Lpoh8QXCh9-ZlaKS0/preset:web_app_icon_160/plain/https://static.rustore.ru/apk/5503167/content/ICON/585ea7fe-2cea-43e8-8575-5af080a5891c.png@webp",
            "domrf": "https://static.rustore.ru/imgproxy/mS2NeKCvqxLfdGu8Ac0Q85mKGPXXtZzDjYcHy6iuNmk/preset:web_app_icon_160/plain/https://static.rustore.ru/apk/4298943/content/ICON/364dabcd-9846-4461-ae69-1c2059bd6fac.png@webp",
            "tbank": "https://static.rustore.ru/imgproxy/qqoP1Cyi4tplnwb8Z_yJ2mnWVhuen4kzin6tQLWsSHY/preset:web_app_icon_160/plain/https://static.rustore.ru/apk/220863/content/ICON/2238e3ca-e3e7-41d0-b037-777ddc637a5b.png@webp",
            "uralsib": "https://static.rustore.ru/imgproxy/yliSWqKGYccS6etKjgDwIpctFbx3ZukT_N-30Vc3jfE/preset:web_app_icon_160/plain/https://static.rustore.ru/apk/1693918655/content/ICON/65eee940-945f-432a-a69f-9d2e62771f20.png@webp",
            "metallinvest": "https://static.rustore.ru/imgproxy/KKkFMVULQrmOlKsSyl2tCaInZmMv_j85HEKsSnOvA0A/preset:web_app_icon_160/plain/https://static.rustore.ru/apk/1725733567/content/ICON/ff637648-d1f3-43d2-b4b5-2aeece75ca52.png@webp",
            "kuban": "https://static.rustore.ru/imgproxy/_gSHL4HDGyC7LQX6zJLq6oSj1kPV1PgtgMk4HCmmWVI/preset:web_app_icon_160/plain/https://static.rustore.ru/apk/2063573337/content/ICON/51cae55a-7e53-4e89-8e70-fd1670619766.jpg@webp"
        };

        banks.forEach(bank => {
            const item = document.createElement("article");
            item.className = "ue-mortgage-bank";

            const bankUrl = bank.url || "#";
            const bankName = bank.shortName || bank.name || "Банк";
            const logoUrl = customLogosMap[bank.id] || "";

            // --- 1. ЛОГОТИП БАНКА (ссылка + картинка из словаря или заглушка) ---
            const logoLink = document.createElement("a");
            logoLink.className = "ue-mortgage-logo-link";
            logoLink.href = bankUrl;
            logoLink.target = "_blank";
            logoLink.rel = "noopener noreferrer";

            if (logoUrl) {
                const logoImg = document.createElement("img");
                logoImg.className = "ue-mortgage-logo";
                logoImg.src = logoUrl;
                logoImg.alt = bankName;
                logoImg.loading = "lazy";
                logoLink.appendChild(logoImg);
            } else {
                const logoFallback = document.createElement("span");
                logoFallback.className = "ue-mortgage-logo-fallback";
                logoFallback.textContent = String(bankName).slice(0, 2).toUpperCase();
                logoLink.appendChild(logoFallback);
            }

            // --- 2. ПЕРВЫЙ DIV (ue-mortgage-bank-label и ue-mortgage-link) ---
            const infoDiv = document.createElement("div");
            infoDiv.className = "ue-mortgage-info-block";

            const nameLabel = document.createElement("span");
            nameLabel.className = "ue-mortgage-bank-label";
            nameLabel.textContent = bankName;

            const link = document.createElement("a");
            link.className = "ue-mortgage-link";
            link.href = bankUrl;
            link.target = "_blank";
            link.rel, "noopener noreferrer";
            link.textContent = "Источник ↗";

            infoDiv.append(nameLabel, link);

            // --- 3. ВТОРОЙ DIV (ue-mortgage-rate и ue-mortgage-live) ---
            const metaDiv = document.createElement("div");
            metaDiv.className = "ue-mortgage-meta-block";

            const rate = document.createElement("div");
            rate.className = "ue-mortgage-rate";
            rate.textContent = "от " + String(bank.rate || "—").replace(".", ",") + "%";

            const status = document.createElement("span");
            status.className = "ue-mortgage-live" + (bank.live ? "" : " is-stale");
            status.textContent = bank.live ? "🟢" : "🟠";

            metaDiv.append(rate, status);

            // Собираем карточку в требуемом порядке
            item.append(logoLink, infoDiv, metaDiv);
            list.appendChild(item);
        });

        // Полностью убираем вывод ошибок кэша — всегда чистый текст
        state.classList.remove("is-error");
        state.textContent = "Актуальные данные по ставкам банков";
    }

    async function initMortgageRatesWidget() {
        const widget = $("#ue-mortgage-widget");
        if (!widget) return;
        let cached = null;
        try { cached = JSON.parse(localStorage.getItem(MORTGAGE_RATES_CACHE_KEY) || "null"); } catch (e) {}
        if (cached && Array.isArray(cached.banks)) mortgageRatesRender(cached, true);
        try {
            const response = await fetch(MORTGAGE_RATES_API_URL, { method: "GET", headers: { "Accept": "application/json" }, cache: "no-store" });
            if (!response.ok) throw new Error("HTTP " + response.status);
            const data = await response.json();
            if (!data || data.ok !== true || !Array.isArray(data.banks) || !data.banks.length) throw new Error("Некорректный ответ API");
            mortgageRatesRender(data, false);
            try {
                localStorage.setItem(MORTGAGE_RATES_CACHE_KEY, JSON.stringify({ banks: data.banks, liveCount: data.liveCount, savedAt: Date.now() }));
            } catch (e) {}
        } catch (error) {
            console.error("Urban Estate Mortgage Rates:", error);
            const state = $("#ue-mortgage-state");
            if (state) {
                state.classList.add("is-error");
                if (!cached || !Array.isArray(cached.banks)) {
                    const list = $("#ue-mortgage-list");
                    if (list) list.textContent = "";
                    state.textContent = "Не удалось загрузить ставки. Обновите страницу позже.";
                }
            }
        }
    }

    renderAll();
    initKeyRateWidget();
    initMortgageRatesWidget();
});
