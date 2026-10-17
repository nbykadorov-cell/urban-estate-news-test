function mortgageRatesRender(data, cacheFallback) {
        const list = $("#ue-mortgage-list");
        const state = $("#ue-mortgage-state");
        if (!list || !state || !data || !Array.isArray(data.banks)) return;
        list.textContent = "";
        const banks = data.banks.slice().sort((a, b) => Number(a.rateValue) - Number(b.rateValue));
        
        // Словарь индивидуальных ссылок на ИЗОБРАЖЕНИЯ ЛОГОТИПОВ для каждого банка
        const customLogosMap = {
            "sberbank": "https://site.ru/logos/sber.png",
            "vtb": "https://site.ru/logos/vtb.png",
            "alfa": "https://site.ru/logos/alfa.png",
            "sovcom": "https://site.ru/logos/sovcom.png",
            "domrf": "https://site.ru/logos/domrf.png",
            "tbank": "https://site.ru/logos/tbank.png"
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
                logoImg.className = "ue-mortgage-logo-img";
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
            link.rel = "noopener noreferrer";
            link.textContent = "Условия";

            infoDiv.append(nameLabel, link);

            // --- 3. ВТОРОЙ DIV (ue-mortgage-rate и ue-mortgage-live) ---
            const metaDiv = document.createElement("div");
            metaDiv.className = "ue-mortgage-meta-block";

            const rate = document.createElement("div");
            rate.className = "ue-mortgage-rate";
            rate.textContent = "от " + String(bank.rate || "—").replace(".", ",") + "%";

            const status = document.createElement("span");
            status.className = "ue-mortgage-live" + (bank.live ? "" : " is-stale");
            status.textContent = bank.live ? "Актуально" : "Архив";

            metaDiv.append(rate, status);

            // Собираем карточку в требуемом порядке
            item.append(logoLink, infoDiv, metaDiv);
            list.appendChild(item);
        });

        // Аккуратный статус без технического счётчика "X из Y"
        state.classList.remove("is-error");
        state.textContent = "Актуальные данные по ставкам банков";
    }
