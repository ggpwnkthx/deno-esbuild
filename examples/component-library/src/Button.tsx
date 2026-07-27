import type { JSX, ReactNode } from 'react'

export interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary'
  disabled?: boolean
}

export function Button(props: ButtonProps): JSX.Element {
  const variant = props.variant ?? 'primary'
  const className = `gg-btn gg-btn--${variant}`
  return (
    <button
      type='button'
      className={className}
      disabled={props.disabled}
      onClick={props.onClick}
      data-testid='gg-button'
    >
      {props.children}
    </button>
  )
}
