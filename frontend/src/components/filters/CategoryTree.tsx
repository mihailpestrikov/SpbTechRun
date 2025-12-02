import { useState, useMemo } from 'react'
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
      <div key={node.id}>
        <label
          className="flex items-center gap-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer"
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelect(node.id, hasChildren)}
            className="rounded border-gray-300"
          />
          <span className="text-sm flex-1 truncate">{node.name}</span>
          <span className="text-xs text-gray-500 pr-2">({count ?? 0})</span>
        </label>
        {hasChildren && isExpanded && (
          <div>
            {node.children.map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  if (tree.length === 0) return null

  return (
    <div className="space-y-0.5 max-h-64 overflow-y-auto">
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
