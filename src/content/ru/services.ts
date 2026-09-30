export type Service = {
  slug: string;
  title: string;
  short: string;
  icon: string;
};

/** Восемь направлений — в этом порядке они выводятся в сетке услуг на главной. */
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
    short: 'Приглашения на мероприятие, проверка документов и сопровождение оформления.',
    icon: 'file-check',
  },
  {
    slug: 'delivery',
    title: 'Доставка',
    short: 'Документы, образцы продукции и материалы: в Астану, из Астаны, прямо на стенд.',
    icon: 'package',
  },
  {
    slug: 'logistics',
    title: 'Погрузка и транспортировка',
    short: 'Погрузка, разгрузка, перенос и упаковка оборудования, локальная перевозка.',
    icon: 'truck',
  },
  {
    slug: 'for-delegations',
    title: 'Сопровождение делегаций',
    short: 'Встреча, транспорт, переводчики, индивидуальная программа и координация группы.',
    icon: 'users',
  },
  {
    slug: 'event-support',
    title: 'Комплексное сопровождение',
    short: 'Один координатор для всех организационных вопросов до, во время и после мероприятия.',
    icon: 'headset',
  },
  {
    slug: 'for-exhibitors',
    title: 'Для экспонентов',
    short: 'Подготовка к выставке, поддержка на стенде и вывоз после закрытия.',
    icon: 'layout-grid',
  },
];

export const serviceBySlug = (slug: string) => services.find((s) => s.slug === slug);
