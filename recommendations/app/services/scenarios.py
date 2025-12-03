"""
Сценарии White Box ремонта.
Каждый сценарий содержит группы категорий товаров, необходимых для этапа.
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ScenarioGroup:
    name: str
    category_patterns: list[str]  # Паттерны для поиска категорий
    category_ids: list[int] = field(default_factory=list)  # Конкретные ID (заполняются при инициализации)
    is_required: bool = True
    sort_order: int = 0
    # Ограничение по root-категориям (если указано - ищем только в этих)
    root_category_ids: Optional[list[int]] = None


# Root-категории для строительства/ремонта
ROOT_CONSTRUCTION = [
    25361,  # Краска и малярный инструмент
    23882,  # Строительные материалы
    23549,  # Ручной инструмент
    30639,  # Электроинструмент
    30640,  # Строительное оборудование
    25260,  # Напольные покрытия
    24016,  # Товары для дома и декора
]


@dataclass
class Scenario:
    id: str
    name: str
    description: str
    groups: list[ScenarioGroup]
    image: str = ""


SCENARIOS: dict[str, Scenario] = {
    "floor": Scenario(
        id="floor",
        name="Монтаж наливного пола",
        description="Смеси для выравнивания полов, инструменты и сопутствующие материалы",
        image="/images/scenarios/floor.jpg",
        groups=[
            ScenarioGroup(
                name="Основа",
                category_patterns=["ровнител", "наливн", "смес для пол", "выравнива"],
                is_required=True,
                sort_order=1,
                root_category_ids=ROOT_CONSTRUCTION,
            ),
            ScenarioGroup(
                name="Грунты",
                category_patterns=["грунтовк", "грунты по", "грунты аэроз", "бетонконтакт", "гидроизоляц полов"],
                is_required=True,
                sort_order=2,
                root_category_ids=ROOT_CONSTRUCTION,
            ),
            ScenarioGroup(
                name="Ёмкости",
                category_patterns=["ведра для краски", "ведра прямоугольн", "ведра круглы"],
                is_required=True,
                sort_order=3,
                root_category_ids=ROOT_CONSTRUCTION,
            ),
            ScenarioGroup(
                name="Валики",
                category_patterns=["валик игольч", "валик"],
                is_required=True,
                sort_order=4,
                root_category_ids=ROOT_CONSTRUCTION,
            ),
            ScenarioGroup(
                name="Миксер",
                category_patterns=["миксер строит", "строительн миксер", "насадки для миксер", "миксеры аккумулятор"],
                is_required=True,
                sort_order=5,
                root_category_ids=ROOT_CONSTRUCTION,
            ),
            ScenarioGroup(
                name="Уровни",
                category_patterns=["уровни пузырьков", "гидроуровн"],
                is_required=False,
                sort_order=6,
                root_category_ids=ROOT_CONSTRUCTION,
            ),
            ScenarioGroup(
                name="Плёнка",
                category_patterns=["пленка защитн", "пленка техническ", "пленки защитн"],
                is_required=False,
                sort_order=7,
                root_category_ids=ROOT_CONSTRUCTION,
            ),
            ScenarioGroup(
                name="Шумоизоляция",
                category_patterns=["теплозвукоизоляц", "панели теплозвук", "изоляция для труб"],
                is_required=False,
                sort_order=8,
                root_category_ids=ROOT_CONSTRUCTION,
            ),
        ],
    ),
    "partitions": Scenario(
        id="partitions",
        name="Монтаж перегородок",
        description="Газоблоки, гипсокартон, клеевые смеси и инструменты для монтажа перегородок",
        image="/images/scenarios/partitions.jpg",
        groups=[
            ScenarioGroup(
                name="Основа",
                category_patterns=["газоблок", "газобетон", "гипсокартон", "гкл", "пгп"],
                is_required=True,
                sort_order=1,
                root_category_ids=ROOT_CONSTRUCTION,
            ),
            ScenarioGroup(
                name="Клей",
                category_patterns=["клей для газоблок", "клей для гкл", "клей монтаж", "раствор кладоч"],
                is_required=True,
                sort_order=2,
                root_category_ids=ROOT_CONSTRUCTION,
            ),
            ScenarioGroup(
                name="Грунты",
                category_patterns=["грунтовк", "грунты по", "грунты аэроз", "бетонконтакт"],
                is_required=True,
                sort_order=3,
                root_category_ids=ROOT_CONSTRUCTION,
            ),
            ScenarioGroup(
                name="Шпатлёвка",
                category_patterns=["шпатлевки сухие", "шпатлевки готов", "шпатлевки полимер"],
                is_required=True,
                sort_order=4,
                root_category_ids=ROOT_CONSTRUCTION,
            ),
            ScenarioGroup(
                name="Ёмкости",
                category_patterns=["ведра для краски", "ведра прямоугольн", "ведра круглы"],
                is_required=True,
                sort_order=5,
                root_category_ids=ROOT_CONSTRUCTION,
            ),
            ScenarioGroup(
                name="Миксер",
                category_patterns=["миксер строит", "строительн миксер", "насадки для миксер", "миксеры аккумулятор"],
                is_required=True,
                sort_order=6,
                root_category_ids=ROOT_CONSTRUCTION,
            ),
        ],
    ),
    "walls": Scenario(
        id="walls",
        name="Выравнивание стен",
        description="Штукатурные смеси, шпатлёвки и инструменты для выравнивания стен",
        image="/images/scenarios/walls.jpg",
        groups=[
            ScenarioGroup(
                name="Основа",
                category_patterns=["штукатурка гипс", "штукатурка цемент", "штукатурка декор"],
                is_required=True,
                sort_order=1,
                root_category_ids=ROOT_CONSTRUCTION,
            ),
            ScenarioGroup(
                name="Грунты",
                category_patterns=["грунтовк", "грунты по", "грунты аэроз", "бетонконтакт"],
                is_required=True,
                sort_order=2,
                root_category_ids=ROOT_CONSTRUCTION,
            ),
            ScenarioGroup(
                name="Шпатлёвка",
                category_patterns=["шпатлевки сухие", "шпатлевки готов", "шпатлевки полимер"],
                is_required=True,
                sort_order=3,
                root_category_ids=ROOT_CONSTRUCTION,
            ),
            ScenarioGroup(
                name="Ёмкости",
                category_patterns=["ведра для краски", "ведра прямоугольн", "ведра круглы"],
                is_required=True,
                sort_order=4,
                root_category_ids=ROOT_CONSTRUCTION,
            ),
            ScenarioGroup(
                name="Правила",
                category_patterns=["правила"],
                is_required=True,
                sort_order=5,
                root_category_ids=ROOT_CONSTRUCTION,
            ),
            ScenarioGroup(
                name="Шпатели",
                category_patterns=["шпател"],
                is_required=True,
                sort_order=6,
                root_category_ids=ROOT_CONSTRUCTION,
            ),
            ScenarioGroup(
                name="Миксер",
                category_patterns=["миксер строит", "строительн миксер", "насадки для миксер", "миксеры аккумулятор"],
                is_required=True,
                sort_order=7,
                root_category_ids=ROOT_CONSTRUCTION,
            ),
            ScenarioGroup(
                name="Армирование",
                category_patterns=["сетки малярн", "серпянк", "сетки армирующ", "сетки штукатурн"],
                is_required=False,
                sort_order=8,
                root_category_ids=ROOT_CONSTRUCTION,
            ),
            ScenarioGroup(
                name="Лента",
                category_patterns=["лент%маляр"],
                is_required=False,
                sort_order=9,
                root_category_ids=ROOT_CONSTRUCTION,
            ),
        ],
    ),
}


class ScenariosService:
    def __init__(self):
        self.scenarios = SCENARIOS
        self._initialized = False

    async def initialize(self, session):
        """Загружает ID категорий по паттернам из БД с фильтрацией по root-категориям"""
        if self._initialized:
            return

        from sqlalchemy import text

        for scenario in self.scenarios.values():
            for group in scenario.groups:
                all_ids = set()
                for pattern in group.category_patterns:
                    # Если указаны root_category_ids - фильтруем по ним
                    if group.root_category_ids:
                        result = await session.execute(
                            text("""
                                WITH RECURSIVE cat_tree AS (
                                    -- Базовый случай: root-категории
                                    SELECT id, parent_id
                                    FROM categories
                                    WHERE id = ANY(:root_ids)
                                    UNION ALL
                                    -- Рекурсивно добавляем всех потомков
                                    SELECT c.id, c.parent_id
                                    FROM categories c
                                    JOIN cat_tree ct ON c.parent_id = ct.id
                                )
                                SELECT c.id FROM categories c
                                JOIN cat_tree ct ON c.id = ct.id
                                WHERE LOWER(c.name) LIKE LOWER(:pattern)
                            """),
                            {"pattern": f"%{pattern}%", "root_ids": group.root_category_ids}
                        )
                    else:
                        result = await session.execute(
                            text("""
                                SELECT id FROM categories
                                WHERE LOWER(name) LIKE LOWER(:pattern)
                            """),
                            {"pattern": f"%{pattern}%"}
                        )
                    ids = [row[0] for row in result.fetchall()]
                    all_ids.update(ids)
                group.category_ids = list(all_ids)
                print(f"  {scenario.id}/{group.name}: {len(group.category_ids)} categories")

        self._initialized = True

    def get_all_scenarios(self) -> list[dict]:
        return [
            {
                "id": s.id,
                "name": s.name,
                "description": s.description,
                "image": s.image,
                "groups_count": len(s.groups),
                "required_groups": sum(1 for g in s.groups if g.is_required),
            }
            for s in self.scenarios.values()
        ]

    def get_scenario(self, scenario_id: str) -> Optional[Scenario]:
        return self.scenarios.get(scenario_id)

    def get_scenario_details(self, scenario_id: str) -> Optional[dict]:
        scenario = self.scenarios.get(scenario_id)
        if not scenario:
            return None
        return {
            "id": scenario.id,
            "name": scenario.name,
            "description": scenario.description,
            "image": scenario.image,
            "groups": [
                {
                    "name": g.name,
                    "category_ids": g.category_ids,
                    "is_required": g.is_required,
                    "sort_order": g.sort_order,
                }
                for g in sorted(scenario.groups, key=lambda x: x.sort_order)
            ],
        }

    def detect_scenario_for_product(self, category_id: int) -> Optional[Scenario]:
        """Определяет к какому сценарию относится товар по категории"""
        for scenario in self.scenarios.values():
            for group in scenario.groups:
                if category_id in group.category_ids:
                    return scenario
        return None

    def detect_scenario_for_cart(self, cart_category_ids: list[int]) -> Optional[dict]:
        """
        Определяет приоритетный сценарий по товарам в корзине.
        Возвращает сценарий с максимальным % заполнения.
        """
        if not cart_category_ids:
            return None

        matches = []

        for scenario in self.scenarios.values():
            completed_groups = 0
            total_required = 0

            for group in scenario.groups:
                if group.is_required:
                    total_required += 1

                # Есть ли в корзине товар из категорий этой группы?
                group_satisfied = any(
                    cat_id in group.category_ids
                    for cat_id in cart_category_ids
                )
                if group_satisfied:
                    completed_groups += 1

            if total_required > 0:
                progress = completed_groups / total_required
            else:
                progress = 0

            if progress > 0:  # Только сценарии с каким-то прогрессом
                matches.append({
                    "scenario_id": scenario.id,
                    "scenario_name": scenario.name,
                    "completed_groups": completed_groups,
                    "total_groups": len(scenario.groups),
                    "required_groups": total_required,
                    "progress": progress,
                })

        if not matches:
            return None

        matches.sort(key=lambda x: x["progress"], reverse=True)
        return {
            "active": matches[0],
            "all_scenarios": matches,
        }


scenarios_service = ScenariosService()
