import type { JSX, ReactNode } from 'react'

export interface CardProps {
  title: string
  children?: ReactNode
}

export function Card(props: CardProps): JSX.Element {
  return (
    <article className='gg-card' data-testid='gg-card'>
      <header className='gg-card__header'>
        <h3 className='gg-card__title'>{props.title}</h3>
      </header>
      <div className='gg-card__body'>{props.children}</div>
    </article>
  )
}
