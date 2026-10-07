// api/image.js

const ALLOWED_HOSTS = [
  "161.ru",
  "93.ru",

  "blog.domclick.ru",
  "domclick.ru",

  "t.me",
  "www.t.me",
  "cdn4.telesco.pe",

  "xn--h1alcedd.xn--d1aqf.xn--p1ai",
  "domrf.ru",
  "www.domrf.ru"
];


function isAllowedHost(hostname) {

  const host =
    String(hostname || "")
      .toLowerCase()
      .replace(/\.$/, "");


  return ALLOWED_HOSTS.some(
    allowed => {

      return (
        host === allowed ||
        host.endsWith(`.${allowed}`)
      );

    }
  );
}


module.exports =
  async function handler(
    req,
    res
  ) {

    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, OPTIONS"
    );


    if (
      req.method ===
      "OPTIONS"
    ) {

      return res
        .status(204)
        .end();
    }


    if (
      req.method !==
      "GET"
    ) {

      return res
        .status(405)
        .send(
          "Method Not Allowed"
        );
    }


    const rawUrl =
      req.query?.url;


    if (
      !rawUrl ||
      typeof rawUrl !==
        "string"
    ) {

      return res
        .status(400)
        .send(
          "Missing image URL"
        );
    }


    let target;


    try {

      target =
        new URL(
          rawUrl
        );

    } catch {

      return res
        .status(400)
        .send(
          "Invalid image URL"
        );
    }


    if (
      !/^https?:$/i.test(
        target.protocol
      )
    ) {

      return res
        .status(400)
        .send(
          "Invalid protocol"
        );
    }


    if (
      !isAllowedHost(
        target.hostname
      )
    ) {

      return res
        .status(403)
        .send(
          "Image host is not allowed"
        );
    }


    const controller =
      new AbortController();


    const timeout =
      setTimeout(
        () =>
          controller.abort(),
        15000
      );


    try {

      const response =
        await fetch(
          target.toString(),
          {
            method: "GET",

            redirect: "follow",

            signal:
              controller.signal,

            headers: {

              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",

              "Accept":
                "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",

              "Accept-Language":
                "ru-RU,ru;q=0.9,en;q=0.7",

              "Referer":
                target.origin + "/"

            }
          }
        );


      if (
        !response.ok
      ) {

        return res
          .status(
            response.status
          )
          .send(
            "Image request failed"
          );
      }


      const contentType =
        response.headers.get(
          "content-type"
        ) || "";


      if (
        !contentType
          .toLowerCase()
          .startsWith(
            "image/"
          )
      ) {

        return res
          .status(415)
          .send(
            "URL does not return an image"
          );
      }


      const contentLength =
        Number(
          response.headers.get(
            "content-length"
          ) || 0
        );


      /*
       * Защита от слишком больших файлов.
       * 10 MB более чем достаточно для карточки новости.
       */

      if (
        contentLength >
        10 * 1024 * 1024
      ) {

        return res
          .status(413)
          .send(
            "Image is too large"
          );
      }


      const arrayBuffer =
        await response.arrayBuffer();


      const buffer =
        Buffer.from(
          arrayBuffer
        );


      if (
        buffer.length >
        10 * 1024 * 1024
      ) {

        return res
          .status(413)
          .send(
            "Image is too large"
          );
      }


      res.setHeader(
        "Content-Type",
        contentType
      );


      res.setHeader(
        "Content-Length",
        String(
          buffer.length
        )
      );


      res.setHeader(
        "Cache-Control",
        "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800"
      );


      res.setHeader(
        "X-Content-Type-Options",
        "nosniff"
      );


      return res
        .status(200)
        .end(buffer);

    } catch (error) {

      console.error(
        "Image proxy error:",
        error
      );


      return res
        .status(502)
        .send(
          "Unable to load image"
        );

    } finally {

      clearTimeout(
        timeout
      );

    }
  };
