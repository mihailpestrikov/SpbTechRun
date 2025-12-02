import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { useCategoryTree, useCategorySearch } from '@/hooks'
import { CategoryTreeItem } from './CategoryTreeItem'
import { AiOutlineClose} from 'react-icons/ai'

interface CatalogModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CatalogModal({ isOpen, onClose }: CatalogModalProps) {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const { data: categoryTree, isLoading } = useCategoryTree()
  const { data: searchResults } = useCategorySearch(searchQuery)

  const handleSelectCategory = (categoryId: number) => {
    navigate(`/?category=${categoryId}`)
    onClose()
    setSearchQuery('')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[70vh] flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Каталог товаров</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          
          <div className="flex items-center w-full  border-[2px] border-red-700 rounded-[15px] p-1">
            <Input
              placeholder="Поиск категории..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              className=" flex-1 border-0 focus:outline-none rounded-[10px]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className=" text-gray-400 hover:text-gray-700 flex-shrink-0 "
              >
                <AiOutlineClose size={20} />
              </button>
            )}
          </div>

        </div>

        <div className="flex-1 overflow-y-auto p-2 ">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Загрузка...</div>
          ) : searchQuery.length >= 2 ? (
            <div>
              {searchResults && searchResults.length > 0 ? (
                <div className="space-y-1">
                  {searchResults.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => handleSelectCategory(cat.id)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded"
                    >
                      <div className="font-medium text-gray-800">{cat.name}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Категории не найдены
                </div>
              )}
            </div>
          ) : (
            <div>
              {categoryTree?.map((category) => (
                <CategoryTreeItem
                  key={category.id}
                  category={category}
                  level={0}
                  onSelect={handleSelectCategory}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
