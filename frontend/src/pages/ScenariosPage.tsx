import { Link } from 'react-router-dom'
import { ChevronRight, Hammer, Layers, PaintBucket, ArrowRight } from 'lucide-react'
import { PageLayout } from '@/components/layout'
import { useScenarios } from '@/hooks'

const SCENARIO_ICONS: Record<string, React.ReactNode> = {
  floor: <Layers className="w-8 h-8" />,
  partitions: <Hammer className="w-8 h-8" />,
  walls: <PaintBucket className="w-8 h-8" />,
}

const SCENARIO_COLORS: Record<string, string> = {
  floor: 'from-blue-500 to-cyan-500',
  partitions: 'from-orange-500 to-amber-500',
  walls: 'from-purple-500 to-pink-500',
}

export function ScenariosPage() {
  const { data: scenarios, isLoading } = useScenarios()

  return (
    <PageLayout>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-8 animate-fade-in">
          <Link to="/" className="hover:text-red-600 transition-colors">Каталог</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-gray-800 font-medium">Сценарии ремонта</span>
        </nav>

        <div className="mb-8 animate-fade-in">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Сценарии ремонта White Box</h1>
          <p className="text-gray-600">
            Выберите этап ремонта и получите подборку всех необходимых материалов и инструментов
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 animate-pulse">
                <div className="w-16 h-16 bg-gray-100 rounded-xl mb-4" />
                <div className="h-6 w-3/4 bg-gray-100 rounded mb-2" />
                <div className="h-4 w-full bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {scenarios?.map(scenario => (
              <Link
                key={scenario.id}
                to={`/scenarios/${scenario.id}`}
                className="group bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
              >
                <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${SCENARIO_COLORS[scenario.id] || 'from-gray-500 to-gray-600'} flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform`}>
                  {SCENARIO_ICONS[scenario.id] || <Hammer className="w-8 h-8" />}
                </div>

                <h2 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-red-600 transition-colors">
                  {scenario.name}
                </h2>

                <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                  {scenario.description}
                </p>

                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-500">
                    <span className="font-medium text-gray-700">{scenario.groups_count}</span> групп товаров
                  </div>
                  <div className="flex items-center gap-1 text-red-600 font-medium text-sm group-hover:gap-2 transition-all">
                    Подробнее
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-12 bg-gradient-to-r from-red-50 to-rose-50 rounded-2xl p-8 border border-red-100">
          <h3 className="text-lg font-bold text-gray-900 mb-2">Как это работает?</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold flex-shrink-0">
                1
              </div>
              <div>
                <h4 className="font-medium text-gray-900 mb-1">Выберите сценарий</h4>
                <p className="text-sm text-gray-600">Определите этап ремонта, который хотите выполнить</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold flex-shrink-0">
                2
              </div>
              <div>
                <h4 className="font-medium text-gray-900 mb-1">Соберите набор</h4>
                <p className="text-sm text-gray-600">Система подберёт все необходимые материалы и инструменты</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold flex-shrink-0">
                3
              </div>
              <div>
                <h4 className="font-medium text-gray-900 mb-1">Оцените подборку</h4>
                <p className="text-sm text-gray-600">Ваши оценки помогают улучшить рекомендации для всех</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
