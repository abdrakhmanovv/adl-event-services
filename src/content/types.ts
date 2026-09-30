export type BlockItem = {
  title: string;
  text?: string;
  icon?: string;
};

export type Block = {
  heading: string;
  text?: string;
  /** карточки-подуслуги */
  items?: BlockItem[];
  /** простой список с галочками */
  list?: string[];
  columns?: 2 | 3;
};

export type FaqItem = {
  q: string;
  a: string;
};

export type ServicePageContent = {
  slug: string;
  /** H1 */
  title: string;
  /** подзаголовок под H1 */
  lead: string;
  metaTitle?: string;
  metaDescription: string;
  /** абзацы после первого экрана */
  intro?: string[];
  blocks: Block[];
  /** важное примечание (например, оговорка про визы) */
  notice?: string;
  /** тизер стоимости */
  priceNote?: string;
  faq: FaqItem[];
  /** slugs связанных услуг */
  related: string[];
  /** какие чекбоксы формы отметить заранее */
  preselect?: string[];
};
