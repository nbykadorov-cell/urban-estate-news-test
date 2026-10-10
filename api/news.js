function extractImage(html, baseUrl, sourceKey = "") {
  const metaRaw = extractMeta(
    html,
    ["og:image", "og:image:url", "twitter:image"]
  );

  const metaImage = normalizeUrl(metaRaw, baseUrl) || "";
  const candidates = extractImageCandidates(html, baseUrl);

  const isBadImage = value =>
    /(?:favicon|sprite|placeholder|default-image|no-image|noimage|avatar|\/logo(?:[/.?_-]|$)|ring-sprosi|sprosi\.domrf)/i
      .test(String(value || ""));

  if (sourceKey === "161ru" || sourceKey === "93ru") {
    // Сначала индивидуальное изображение статьи.
    if (metaImage && !isBadImage(metaImage)) {
      return metaImage;
    }

    // Затем изображение с CDN hsmedia.ru.
    const hsmedia = candidates.find(url => {
      try {
        return (
          /(?:^|\.)hsmedia\.ru$/i.test(
            new URL(url).hostname
          ) &&
          !isBadImage(url)
        );
      } catch {
        return false;
      }
    });

    if (hsmedia) {
      return hsmedia;
    }

    return (
      candidates.find(url => !isBadImage(url)) ||
      metaImage ||
      ""
    );
  }

  if (sourceKey === "domrf") {
    // В первую очередь — файлы медиатеки ДОМ.РФ.
    const preferred = candidates.find(url =>
      /\/upload\/medialibrary\//i.test(url) &&
      !isBadImage(url)
    );

    if (preferred) {
      return preferred;
    }

    // Другие изображения статьи.
    const articleImage = candidates.find(url =>
      !isBadImage(url) &&
      /\.(?:jpe?g|png|webp)(?:[?#]|$)/i.test(url)
    );

    if (articleImage) {
      return articleImage;
    }

    if (metaImage && !isBadImage(metaImage)) {
      return metaImage;
    }

    return "";
  }

  return (
    metaImage ||
    candidates.find(url => !isBadImage(url)) ||
    ""
  );
}
