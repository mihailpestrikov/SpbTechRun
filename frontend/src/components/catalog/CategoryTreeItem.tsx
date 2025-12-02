import { useState } from 'react'
import type { CategoryWithChildren } from '@/types'

interface CategoryTreeItemProps {
  category: CategoryWithChildren
  level: number
  onSelect: (categoryId: number) => void
}

export function CategoryTreeItem({ category, level, onSelect }: CategoryTreeItemProps) {
  const [isOpen, setIsOpen] = useState(false)
  const hasChildren = category.children && category.children.length > 0

  const handleSelect = () => {
    onSelect(category.id)
  }

  return (
    <div>
      <div
        className="flex items-center gap-2 py-2 px-3 hover:bg-gray-100 rounded-[10px] cursor-pointer group"
        style={{ paddingLeft: `${level * 16 + 12}px` }}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setIsOpen(!isOpen)
            }}
            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600"
          >
            <svg
              className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
        {!hasChildren && <div className="w-5" />}

        <span
          onClick={handleSelect}
          className="flex-1 text-gray-700 hover:text-red-700"
        >
          {category.name}
        </span>

        {hasChildren && (
          <button
            onClick={handleSelect}
            className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-red-700 transition-opacity"
          >
            Все
          </button>
        )}
      </div>

      {isOpen && hasChildren && (
        <div>
          {category.children!.map((child) => (
            <CategoryTreeItem
              key={child.id}
              category={child}
              level={level + 1}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}
