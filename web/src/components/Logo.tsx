import logoCutout from '../assets/logo-cutout-web.png';

export default function Logo({ size = 40, className = '' }: { size?: number; className?: string }) {
  return <img src={logoCutout} alt="Studio Personal" className={`logo-img ${className}`} style={{ height: size }} />;
}
