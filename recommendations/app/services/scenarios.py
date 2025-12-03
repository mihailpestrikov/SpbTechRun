import logging
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class ScenarioGroup:
    """Группа товаров в сценарии с явно заданными ID категорий"""
    name: str
    category_ids: list[int]
    is_required: bool = True
    sort_order: int = 0


CATEGORY_IDS = {
    # Общие
    "buckets": [25252],
    "film": [30227],
    "mixers": [29165],
    "levels": [23708],
    "primers": [25380],
    "insulation": [25191],

    # Наливной пол
    "floor_mixes": [25185],
    "rollers": [30808],
    "waterproofing": [25186],

    # Перегородки
    "gas_blocks": [25229],
    "drywall": [25165],
    "mounting_adhesive": [25201],

    # Стены
    "putty": [25179, 30462],
    "plaster": [25178],
    "rules": [23705],
    "spatulas": [30226],
    "mesh_tape": [30229],

    # Укладка плитки
    "floor_tile": [27647],
    "wall_tile": [25340],
    "tile_adhesive": [25357],
    "tile_grout": [25358],
    "tile_leveling": [28500],
    "tile_crosses": [34844],
    "tile_corners": [25342],
    "sealants": [25197],

    # Электромонтаж
    "cable": [25026],
    "conduit": [25007],
    "sockets": [24994],
    "switches": [24988],
    "socket_frames": [24997],
    "circuit_breakers": [25047],
    "electrical_tape": [28723],
    "cable_ties": [30194],
}


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
                name="Смеси для выравнивания полов",
                category_ids=CATEGORY_IDS["floor_mixes"],
                is_required=True,
                sort_order=1,
            ),
            ScenarioGroup(
                name="Грунтовки",
                category_ids=CATEGORY_IDS["primers"],
                is_required=True,
                sort_order=2,
            ),
            ScenarioGroup(
                name="Ёмкости строительные",
                category_ids=CATEGORY_IDS["buckets"],
                is_required=True,
                sort_order=3,
            ),
            ScenarioGroup(
                name="Валики игольчатые",
                category_ids=CATEGORY_IDS["rollers"],
                is_required=True,
                sort_order=4,
            ),
            ScenarioGroup(
                name="Насадки для миксеров",
                category_ids=CATEGORY_IDS["mixers"],
                is_required=True,
                sort_order=5,
            ),
            ScenarioGroup(
                name="Уровни пузырьковые",
                category_ids=CATEGORY_IDS["levels"],
                is_required=False,
                sort_order=6,
            ),
            ScenarioGroup(
                name="Плёнки защитные",
                category_ids=CATEGORY_IDS["film"],
                is_required=False,
                sort_order=7,
            ),
            ScenarioGroup(
                name="Теплозвукоизоляция",
                category_ids=CATEGORY_IDS["insulation"],
                is_required=False,
                sort_order=8,
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
                name="Газобетонные блоки",
                category_ids=CATEGORY_IDS["gas_blocks"],
                is_required=True,
                sort_order=1,
            ),
            ScenarioGroup(
                name="Гипсокартон",
                category_ids=CATEGORY_IDS["drywall"],
                is_required=True,
                sort_order=2,
            ),
            ScenarioGroup(
                name="Клей монтажный",
                category_ids=CATEGORY_IDS["mounting_adhesive"],
                is_required=True,
                sort_order=3,
            ),
            ScenarioGroup(
                name="Грунтовки",
                category_ids=CATEGORY_IDS["primers"],
                is_required=True,
                sort_order=4,
            ),
            ScenarioGroup(
                name="Шпатлёвки",
                category_ids=CATEGORY_IDS["putty"],
                is_required=True,
                sort_order=5,
            ),
            ScenarioGroup(
                name="Ёмкости строительные",
                category_ids=CATEGORY_IDS["buckets"],
                is_required=True,
                sort_order=6,
            ),
            ScenarioGroup(
                name="Насадки для миксеров",
                category_ids=CATEGORY_IDS["mixers"],
                is_required=True,
                sort_order=7,
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
                name="Штукатурка гипсовая",
                category_ids=CATEGORY_IDS["plaster"],
                is_required=True,
                sort_order=1,
            ),
            ScenarioGroup(
                name="Грунтовки",
                category_ids=CATEGORY_IDS["primers"],
                is_required=True,
                sort_order=2,
            ),
            ScenarioGroup(
                name="Шпатлёвки",
                category_ids=CATEGORY_IDS["putty"],
                is_required=True,
                sort_order=3,
            ),
            ScenarioGroup(
                name="Ёмкости строительные",
                category_ids=CATEGORY_IDS["buckets"],
                is_required=True,
                sort_order=4,
            ),
            ScenarioGroup(
                name="Правила",
                category_ids=CATEGORY_IDS["rules"],
                is_required=True,
                sort_order=5,
            ),
            ScenarioGroup(
                name="Шпатели",
                category_ids=CATEGORY_IDS["spatulas"],
                is_required=True,
                sort_order=6,
            ),
            ScenarioGroup(
                name="Насадки для миксеров",
                category_ids=CATEGORY_IDS["mixers"],
                is_required=True,
                sort_order=7,
            ),
            ScenarioGroup(
                name="Сетки малярные, серпянка",
                category_ids=CATEGORY_IDS["mesh_tape"],
                is_required=False,
                sort_order=8,
            ),
        ],
    ),
    "tiling": Scenario(
        id="tiling",
        name="Укладка плитки",
        description="Плитка, клеевые смеси, затирки и инструменты для укладки",
        image="/images/scenarios/tiling.jpg",
        groups=[
            ScenarioGroup(
                name="Керамогранит напольный",
                category_ids=CATEGORY_IDS["floor_tile"],
                is_required=True,
                sort_order=1,
            ),
            ScenarioGroup(
                name="Плитка настенная",
                category_ids=CATEGORY_IDS["wall_tile"],
                is_required=True,
                sort_order=2,
            ),
            ScenarioGroup(
                name="Клей для плитки",
                category_ids=CATEGORY_IDS["tile_adhesive"],
                is_required=True,
                sort_order=3,
            ),
            ScenarioGroup(
                name="Затирки для плитки",
                category_ids=CATEGORY_IDS["tile_grout"],
                is_required=True,
                sort_order=4,
            ),
            ScenarioGroup(
                name="Грунтовки",
                category_ids=CATEGORY_IDS["primers"],
                is_required=True,
                sort_order=5,
            ),
            ScenarioGroup(
                name="Системы выравнивания плитки",
                category_ids=CATEGORY_IDS["tile_leveling"],
                is_required=True,
                sort_order=6,
            ),
            ScenarioGroup(
                name="Крестики для плитки",
                category_ids=CATEGORY_IDS["tile_crosses"],
                is_required=True,
                sort_order=7,
            ),
            ScenarioGroup(
                name="Уголки и бордюры для плитки",
                category_ids=CATEGORY_IDS["tile_corners"],
                is_required=False,
                sort_order=8,
            ),
            ScenarioGroup(
                name="Герметики",
                category_ids=CATEGORY_IDS["sealants"],
                is_required=False,
                sort_order=9,
            ),
            ScenarioGroup(
                name="Ёмкости строительные",
                category_ids=CATEGORY_IDS["buckets"],
                is_required=False,
                sort_order=10,
            ),
        ],
    ),
    "electrical": Scenario(
        id="electrical",
        name="Электромонтаж",
        description="Кабели, розетки, выключатели и материалы для электропроводки",
        image="/images/scenarios/electrical.jpg",
        groups=[
            ScenarioGroup(
                name="Кабель электрический",
                category_ids=CATEGORY_IDS["cable"],
                is_required=True,
                sort_order=1,
            ),
            ScenarioGroup(
                name="Трубы гофрированные",
                category_ids=CATEGORY_IDS["conduit"],
                is_required=True,
                sort_order=2,
            ),
            ScenarioGroup(
                name="Розетки встраиваемые",
                category_ids=CATEGORY_IDS["sockets"],
                is_required=True,
                sort_order=3,
            ),
            ScenarioGroup(
                name="Выключатели встраиваемые",
                category_ids=CATEGORY_IDS["switches"],
                is_required=True,
                sort_order=4,
            ),
            ScenarioGroup(
                name="Рамки для розеток и выключателей",
                category_ids=CATEGORY_IDS["socket_frames"],
                is_required=True,
                sort_order=5,
            ),
            ScenarioGroup(
                name="Автоматы защиты",
                category_ids=CATEGORY_IDS["circuit_breakers"],
                is_required=True,
                sort_order=6,
            ),
            ScenarioGroup(
                name="Изолента",
                category_ids=CATEGORY_IDS["electrical_tape"],
                is_required=True,
                sort_order=7,
            ),
            ScenarioGroup(
                name="Стяжки кабельные",
                category_ids=CATEGORY_IDS["cable_ties"],
                is_required=False,
                sort_order=8,
            ),
        ],
    ),
}


class ScenariosService:
    def __init__(self):
        self.scenarios = SCENARIOS

    async def initialize(self, session):
        """Категории уже заданы явно в CATEGORY_IDS, инициализация не требуется"""
        for scenario in self.scenarios.values():
            for group in scenario.groups:
                logger.info(f"{scenario.id}/{group.name}: {len(group.category_ids)} categories")

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
