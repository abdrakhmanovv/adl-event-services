/**
 * Общие данные сайта. Всё, что помечено «ЗАМЕНИТЬ», — заглушки:
 * реальные контакты подставляются сюда один раз и расходятся по всем страницам.
 */
export const site = {
  name: 'ADL Event Services',
  shortName: 'ADL',
  legalName: 'ADL Event Services',
  tagline: 'Сервис сопровождения деловых мероприятий в Казахстане',
  description:
    'Размещение, трансферы, визовая поддержка, доставка и логистика для участников, экспонентов и делегаций деловых мероприятий в Астане.',
  city: 'Астана',
  country: 'Казахстан',

  // ЗАМЕНИТЬ на реальные контакты
  phone: '+7 700 000 00 00',
  phoneHref: 'tel:+77000000000',
  email: 'info@adlevents.kz',
  whatsapp: '77000000000', // только цифры, с кодом страны
  telegram: 'adl_events', // без @
  address: 'Астана, адрес офиса уточняется',
  mapEmbedUrl: '', // ссылка iframe с 2ГИС или Google Maps; пусто — карта не показывается
  hours: 'Ежедневно с 9:00 до 21:00 (время Астаны)',
  responseTime: 'Отвечаем в течение 30 минут в рабочее время',

  // Ключ Web3Forms (web3forms.com) для отправки формы на email. Пусто — форма уходит в WhatsApp.
  formAccessKey: '',

  languages: ['Русский', 'English', 'Қазақша'],
};

export const contactLinks = {
  whatsapp: (text?: string) =>
    `https://wa.me/${site.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ''}`,
  telegram: () => `https://t.me/${site.telegram}`,
  mail: (subject?: string) =>
    `mailto:${site.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`,
};

export const nav = [
  { label: 'Услуги', href: '/event-support', children: 'services' as const },
  { label: 'Экспонентам', href: '/for-exhibitors' },
  { label: 'Делегациям', href: '/for-delegations' },
  { label: 'Мероприятия', href: '/events' },
  { label: 'Кейсы', href: '/cases' },
  { label: 'Контакты', href: '/contacts' },
];

export const footerColumns = [
  {
    title: 'Услуги',
    links: [
      { label: 'Размещение', href: '/accommodation' },
      { label: 'Трансферы', href: '/transfers' },
      { label: 'Визовая поддержка', href: '/visa-support' },
      { label: 'Доставка', href: '/delivery' },
      { label: 'Погрузка и транспортировка', href: '/logistics' },
      { label: 'Комплексное сопровождение', href: '/event-support' },
    ],
  },
  {
    title: 'Для кого',
    links: [
      { label: 'Экспонентам', href: '/for-exhibitors' },
      { label: 'Делегациям', href: '/for-delegations' },
      { label: 'Мероприятия', href: '/events' },
    ],
  },
  {
    title: 'Компания',
    links: [
      { label: 'Кейсы', href: '/cases' },
      { label: 'Рекомендательные письма', href: '/letters' },
      { label: 'Контакты', href: '/contacts' },
    ],
  },
];

export const upcomingEvent = {
  name: 'Kazakhstan Machinery Fair 2027',
  shortName: 'KMF 2027',
  dates: '31 марта — 2 апреля 2027',
  venue: 'МВЦ EXPO, Астана',
  href: '/events',
};
