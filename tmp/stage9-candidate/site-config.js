(function () {
  "use strict";

  if (window.sofievkaSiteConfig) return;

  window.sofievkaSiteConfig = Object.freeze({
    siteUrl: "https://sofievka.vercel.app",
    name: "Торговий дім «Софіївка»",
    shortName: "Софіївка",
    positioning: "Комплексне інженерне оснащення будинків, бізнесу та промислових об’єктів",
    experienceYears: 20,
    contacts: Object.freeze({
      confirmed: false,
      phone: "",
      secondaryPhone: "",
      email: "",
      partnerEmail: "",
      address: "",
      openingHours: ""
    }),
    primaryNavigation: Object.freeze([
      Object.freeze({ href: "/about", label: "Про нас", pages: Object.freeze(["about"]) }),
      Object.freeze({ href: "/solutions", label: "Рішення", pages: Object.freeze(["solutions"]) }),
      Object.freeze({ href: "/installation", label: "Монтаж", pages: Object.freeze(["installation"]) }),
      Object.freeze({ href: "/service-center", label: "Сервіс", pages: Object.freeze(["service-center", "services"]) }),
      Object.freeze({ href: "/delivery", label: "Доставка й оплата", pages: Object.freeze(["delivery", "payment"]) }),
      Object.freeze({ href: "/contact", label: "Контакти", pages: Object.freeze(["contact"]) })
    ]),
    catalogNavigation: Object.freeze([
      Object.freeze({ id: "heating", href: "/catalog/heating", label: "Опалення" }),
      Object.freeze({ id: "water-supply", href: "/catalog/water-supply", label: "Водопостачання" }),
      Object.freeze({ id: "plumbing", href: "/catalog/plumbing", label: "Сантехніка" }),
      Object.freeze({ id: "climate", href: "/catalog/climate", label: "Клімат" })
    ]),
    serviceNavigation: Object.freeze([
      Object.freeze({ href: "/solutions", label: "Комплексні рішення" }),
      Object.freeze({ href: "/installation", label: "Монтаж" }),
      Object.freeze({ href: "/service-center", label: "Сервісний центр" }),
      Object.freeze({ href: "/partnership", label: "Для професіоналів" })
    ]),
    buyerNavigation: Object.freeze([
      Object.freeze({ href: "/delivery", label: "Доставка" }),
      Object.freeze({ href: "/payment", label: "Оплата" }),
      Object.freeze({ href: "/warranty", label: "Гарантія" }),
      Object.freeze({ href: "/returns", label: "Обмін і повернення" }),
      Object.freeze({ href: "/faq", label: "Часті запитання" })
    ])
  });
})();
