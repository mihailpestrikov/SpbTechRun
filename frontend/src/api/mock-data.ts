import type { Category, Product, Order } from '@/types'

export const mockCategories: Category[] = [
  // Корневые категории
  { id: 1, name: 'Строительные материалы', parentId: null },
  { id: 2, name: 'Инструменты', parentId: null },
  { id: 3, name: 'Электрика', parentId: null },
  { id: 4, name: 'Сантехника', parentId: null },
  { id: 5, name: 'Отделочные материалы', parentId: null },
  { id: 6, name: 'Товары для сада', parentId: null },

  // Строительные материалы (id: 1)
  { id: 101, name: 'Штукатурки и смеси', parentId: 1 },
  { id: 102, name: 'Гипсокартон и профили', parentId: 1 },
  { id: 103, name: 'Утеплители', parentId: 1 },
  { id: 104, name: 'Кирпич и блоки', parentId: 1 },

  // Штукатурки и смеси (id: 101)
  { id: 1011, name: 'Гипсовые штукатурки', parentId: 101 },
  { id: 1012, name: 'Цементные штукатурки', parentId: 101 },
  { id: 1013, name: 'Шпаклёвки', parentId: 101 },
  { id: 1014, name: 'Грунтовки', parentId: 101 },

  // Гипсокартон и профили (id: 102)
  { id: 1021, name: 'Гипсокартонные листы', parentId: 102 },
  { id: 1022, name: 'Профили для ГКЛ', parentId: 102 },
  { id: 1023, name: 'Крепёж для ГКЛ', parentId: 102 },

  // Инструменты (id: 2)
  { id: 201, name: 'Ручной инструмент', parentId: 2 },
  { id: 202, name: 'Электроинструмент', parentId: 2 },
  { id: 203, name: 'Измерительный инструмент', parentId: 2 },
  { id: 204, name: 'Малярный инструмент', parentId: 2 },

  // Ручной инструмент (id: 201)
  { id: 2011, name: 'Шпатели', parentId: 201 },
  { id: 2012, name: 'Правила', parentId: 201 },
  { id: 2013, name: 'Кельмы и мастерки', parentId: 201 },
  { id: 2014, name: 'Молотки', parentId: 201 },

  // Электроинструмент (id: 202)
  { id: 2021, name: 'Перфораторы', parentId: 202 },
  { id: 2022, name: 'Дрели и шуруповёрты', parentId: 202 },
  { id: 2023, name: 'Болгарки (УШМ)', parentId: 202 },
  { id: 2024, name: 'Миксеры строительные', parentId: 202 },

  // Электрика (id: 3)
  { id: 301, name: 'Кабели и провода', parentId: 3 },
  { id: 302, name: 'Розетки и выключатели', parentId: 3 },
  { id: 303, name: 'Щитовое оборудование', parentId: 3 },
  { id: 304, name: 'Освещение', parentId: 3 },

  // Кабели и провода (id: 301)
  { id: 3011, name: 'Силовые кабели', parentId: 301 },
  { id: 3012, name: 'Гофра и кабель-каналы', parentId: 301 },
  { id: 3013, name: 'Клеммы и наконечники', parentId: 301 },

  // Розетки и выключатели (id: 302)
  { id: 3021, name: 'Подрозетники', parentId: 302 },
  { id: 3022, name: 'Розетки', parentId: 302 },
  { id: 3023, name: 'Выключатели', parentId: 302 },

  // Сантехника (id: 4)
  { id: 401, name: 'Трубы и фитинги', parentId: 4 },
  { id: 402, name: 'Смесители', parentId: 4 },
  { id: 403, name: 'Унитазы и раковины', parentId: 4 },
  { id: 404, name: 'Водонагреватели', parentId: 4 },

  // Отделочные материалы (id: 5)
  { id: 501, name: 'Напольные покрытия', parentId: 5 },
  { id: 502, name: 'Плитка керамическая', parentId: 5 },
  { id: 503, name: 'Краски и лаки', parentId: 5 },
  { id: 504, name: 'Обои', parentId: 5 },

  // Товары для сада (id: 6)
  { id: 601, name: 'Садовая техника', parentId: 6 },
  { id: 602, name: 'Товары для полива', parentId: 6 },
  { id: 603, name: 'Садовый инвентарь', parentId: 6 },

  // Садовая техника (id: 601)
  { id: 6011, name: 'Газонокосилки', parentId: 601 },
  { id: 6012, name: 'Триммеры', parentId: 601 },
  { id: 6013, name: 'Культиваторы', parentId: 601 },
]

export const mockProducts: Product[] = [
  {
    id: 1,
    name: 'Штукатурка KNAUF Ротбанд 30кг',
    description: 'Универсальная гипсовая штукатурка для внутренних работ. Подходит для ручного и машинного нанесения.',
    price: 450,
    brand: 'KNAUF',
    categoryId: 1011,
    category: { id: 1011, name: 'Гипсовые штукатурки', parentId: 101 },
    imageUrl: '',
    params: { weight: '30 кг', type: 'гипсовая' },
  },
  {
    id: 2,
    name: 'Грунтовка глубокого проникновения 10л',
    description: 'Укрепляет основание, снижает впитываемость. Для внутренних и наружных работ.',
    price: 890,
    brand: 'Ceresit',
    categoryId: 1014,
    category: { id: 1014, name: 'Грунтовки', parentId: 101 },
    imageUrl: '',
    params: { volume: '10 л' },
  },
  {
    id: 3,
    name: 'Шпатель фасадный 350мм',
    description: 'Профессиональный шпатель из нержавеющей стали с удобной ручкой.',
    price: 320,
    brand: 'Stayer',
    categoryId: 2011,
    category: { id: 2011, name: 'Шпатели', parentId: 201 },
    imageUrl: '',
    params: { width: '350 мм' },
  },
  {
    id: 4,
    name: 'Провод ВВГ 3x2.5 50м',
    description: 'Силовой кабель для скрытой проводки. Медные жилы, ПВХ изоляция.',
    price: 3200,
    brand: 'Электрокабель',
    categoryId: 3011,
    category: { id: 3011, name: 'Силовые кабели', parentId: 301 },
    imageUrl: '',
    params: { length: '50 м', section: '3x2.5' },
  },
  {
    id: 5,
    name: 'Гипсокартон KNAUF 12.5мм',
    description: 'Стандартный гипсокартонный лист для внутренней отделки.',
    price: 380,
    brand: 'KNAUF',
    categoryId: 1021,
    category: { id: 1021, name: 'Гипсокартонные листы', parentId: 102 },
    imageUrl: '',
    params: { thickness: '12.5 мм', size: '2500x1200' },
  },
  {
    id: 6,
    name: 'Правило алюминиевое 2м',
    description: 'Для выравнивания штукатурки и стяжки.',
    price: 650,
    brand: 'Stayer',
    categoryId: 2012,
    category: { id: 2012, name: 'Правила', parentId: 201 },
    imageUrl: '',
    params: { length: '2 м' },
  },
  {
    id: 7,
    name: 'Подрозетник d68мм',
    description: 'Для установки розеток и выключателей в гипсокартон.',
    price: 25,
    brand: 'Schneider',
    categoryId: 3021,
    category: { id: 3021, name: 'Подрозетники', parentId: 302 },
    imageUrl: '',
    params: { diameter: '68 мм' },
  },
  {
    id: 8,
    name: 'Профиль ПН 27x28 3м',
    description: 'Направляющий профиль для каркаса под гипсокартон.',
    price: 120,
    brand: 'KNAUF',
    categoryId: 1022,
    category: { id: 1022, name: 'Профили для ГКЛ', parentId: 102 },
    imageUrl: '',
    params: { size: '27x28 мм', length: '3 м' },
  },
]

export const mockOrders: Order[] = [
  {
    id: 1234,
    createdAt: '2025-11-28T10:00:00Z',
    status: 'completed',
    totalPrice: 3750,
    items: [
      { product: mockProducts[0], quantity: 2, price: 450 },
      { product: mockProducts[2], quantity: 1, price: 320 },
    ],
  },
  {
    id: 1233,
    createdAt: '2025-11-25T14:30:00Z',
    status: 'completed',
    totalPrice: 3200,
    items: [
      { product: mockProducts[3], quantity: 1, price: 3200 },
    ],
  },
]
