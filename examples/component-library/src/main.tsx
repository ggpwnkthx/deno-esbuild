import { createRoot } from 'react-dom/client'
import { Button } from './Button.tsx'
import { Card } from './Card.tsx'

function formatCount(n: number): string {
  return `Clicked ${n} times`
}

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')

let count = 0
function handleClick() {
  count += 1
  const node = document.querySelector('[data-testid="gg-count"]')
  if (node) node.textContent = formatCount(count)
}

createRoot(root).render(
  <main>
    <Card title='Example card'>
      <Button onClick={handleClick}>Click me</Button>
      <p data-testid='gg-count'>{formatCount(0)}</p>
    </Card>
  </main>,
)
