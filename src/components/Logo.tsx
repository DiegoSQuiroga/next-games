import logo from '../assets/Logo.png'

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`logo ${compact ? 'logo--compact' : ''}`}>
      <img src={logo} alt="Next House logo" className="logo__image" />
      {!compact ? <span className="logo__text">Next House</span> : null}
    </div>
  )
}

export default Logo
