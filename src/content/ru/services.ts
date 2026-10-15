export type Service = {
  slug: string;
  title: string;
  short: string;
  icon: string;
};

/** Шесть направлений — в этом порядке они выводятся в меню «Услуги», в подвале и в сетке на главной. */
export const services: Service[] = [
  {
    slug: 'accommodation',
    title: 'Размещение',
    short: 'Отели, гостиничные блоки, групповые и VIP-бронирования рядом с площадкой.',
    icon: 'bed',
  },
  {
    slug: 'transfers',
    title: 'Трансферы',
    short: 'Аэропорт, отель, площадка. От индивидуального автомобиля до автобусов для группы.',
    icon: 'car',
  },
  {
    slug: 'visa-support',
    title: 'Визовая поддержка',
    short: 'Оформление приглашений, подготовка и проверка документов, визовая поддержка участников и иностранных делегаций.',
    icon: 'file-check',
  },
  {
    slug: 'venue',
    title: 'Площадка и оборудование',
    short: 'Подготовка пространства, аренда и установка оборудования, монтаж, клининг и техническая поддержка.',
    icon: 'layout-grid',
  },
  {
    slug: 'delivery',
    title: 'Доставка и логистика',
    short: 'Документы, образцы и оборудование: доставка, погрузка, перенос и вывоз со стенда.',
    icon: 'package',
  },
  {
    slug: 'event-support',
    title: 'Комплексное сопровождение',
    short: 'Один координатор для всех организационных вопросов до, во время и после мероприятия.',
    icon: 'headset',
  },
];

export const serviceBySlug = (slug: string) => services.find((s) => s.slug === slug);
