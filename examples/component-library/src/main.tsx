import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import { createRoot } from 'react-dom/client'

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
    <Card sx={{ maxWidth: 360 }}>
      <CardContent>
        <Typography variant='h5' component='h2'>
          Example card
        </Typography>
        <Button variant='contained' onClick={handleClick}>
          Click me
        </Button>
        <Typography variant='body2' data-testid='gg-count'>
          {formatCount(0)}
        </Typography>
      </CardContent>
    </Card>
  </main>,
)
