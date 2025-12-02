import { useState, useMemo, useEffect } from 'react'
import { ChevronRight, Check } from 'lucide-react'
import type { Category, CategoryAgg } from '@/types'

interface CategoryTreeProps {
  categories: Category[]
  counts: Map<number, number>
  selected: number[]
  onChange: (ids: number[]) => void
}

interface TreeNode {
  id: number
  name: string
  parent_id: number | null
  children: TreeNode[]
}

export function CategoryTree({ categories, counts, selected, onChange }: CategoryTreeProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const getAncestorIds = (categoryId: number): number[] => {
    const ancestors: number[] = []
    const cat = categories.find(c => c.id === categoryId)
    if (!cat) return ancestors

    let parentId = cat.parent_id
    while (parentId !== null && parentId !== undefined) {
      ancestors.push(parentId)
      const parentCat = categories.find(c => c.id === parentId)
      if (!parentCat) break
      parentId = parentCat.parent_id
    }
    return ancestors
  }

  useEffect(() => {
    if (selected.length > 0) {
      const allAncestors = new Set<number>()
      for (const id of selected) {
        for (const ancestorId of getAncestorIds(id)) {
          allAncestors.add(ancestorId)
        }
      }
      if (allAncestors.size > 0) {
        setExpanded(prev => new Set([...prev, ...allAncestors]))
      }
    } else {
      setExpanded(new Set())
    }
  }, [selected, categories])

  const tree = useMemo(() => {
    const map = new Map<number, TreeNode>()
    const roots: TreeNode[] = []

    for (const cat of categories) {
      map.set(cat.id, { id: cat.id, name: cat.name, parent_id: cat.parent_id, children: [] })
    }

    for (const cat of categories) {
      const node = map.get(cat.id)!
      if (cat.parent_id == null) {
        roots.push(node)
      } else {
        const parent = map.get(cat.parent_id)
        if (parent) {
          parent.children.push(node)
        }
      }
    }

    return roots
  }, [categories])

  const getDescendantIds = (nodeId: number): number[] => {
    const ids: number[] = []
    const collect = (id: number) => {
      for (const cat of categories) {
        if (cat.parent_id === id) {
          ids.push(cat.id)
          collect(cat.id)
        }
      }
    }
    collect(nodeId)
    return ids
  }

  const toggleSelect = (id: number, hasChildren: boolean) => {
    const isCurrentlySelected = selected.includes(id)

    let newSelected: number[]
    if (isCurrentlySelected) {
      const descendantIds = getDescendantIds(id)
      const toRemove = new Set([id, ...descendantIds])
      newSelected = selected.filter((s) => !toRemove.has(s))
    } else {
      newSelected = [...selected, id]
    }
    onChange(newSelected)

    if (hasChildren) {
      if (isCurrentlySelected) {
        const descendantIds = getDescendantIds(id)
        setExpanded((prev) => {
          const next = new Set(prev)
          next.delete(id)
          descendantIds.forEach(d => next.delete(d))
          return next
        })
      } else {
        setExpanded((prev) => new Set([...prev, id]))
      }
    }
  }

  const renderNode = (node: TreeNode, level: number) => {
    const hasChildren = node.children.length > 0
    const isExpanded = expanded.has(node.id)
    const isSelected = selected.includes(node.id)
    const count = counts.get(node.id)

    return (
      <div key={node.id} className="animate-fade-in">
        <label
          className={`flex items-center gap-2 py-2 px-2 rounded-lg cursor-pointer transition-all duration-200 group ${
            isSelected ? 'bg-red-50' : 'hover:bg-gray-50'
          }`}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
        >
          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
            isSelected
              ? 'bg-red-500 border-red-500'
              : 'border-gray-300 group-hover:border-gray-400'
          }`}>
            {isSelected && <Check className="w-3 h-3 text-white" />}
          </div>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelect(node.id, hasChildren)}
            className="sr-only"
          />
          {hasChildren && (
            <ChevronRight
              className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${
                isExpanded ? 'rotate-90' : ''
              }`}
            />
          )}
          <span className={`text-sm flex-1 truncate ${isSelected ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
            {node.name}
          </span>
          <span className={`text-xs flex-shrink-0 ${isSelected ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
            {count ?? 0}
          </span>
        </label>
        {hasChildren && isExpanded && (
          <div className="overflow-hidden animate-slide-down">
            {node.children.map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  if (tree.length === 0) return null

  return (
    <div className="space-y-0.5 max-h-80 overflow-y-auto scrollbar-thin -mx-2">
      {tree.map((node) => renderNode(node, 0))}
    </div>
  )
}

export function buildCountsMap(aggregations?: CategoryAgg[]): Map<number, number> {
  const map = new Map<number, number>()
  if (aggregations) {
    for (const agg of aggregations) {
      map.set(agg.id, agg.count)
    }
  }
  return map
}
