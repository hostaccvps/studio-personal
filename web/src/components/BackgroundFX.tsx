import remoWatermark from '../assets/logo-remo-watermark.png';

/** Fundo fixo do app: brilhos verdes bem suaves + marca d'água da Studio Remo Game nos cantos. */
export default function BackgroundFX() {
  return (
    <div className="bg-fx" aria-hidden="true">
      <div className="bg-glow bg-glow-a" />
      <div className="bg-glow bg-glow-b" />
      <img src={remoWatermark} className="bg-watermark bg-watermark-tl" alt="" />
      <img src={remoWatermark} className="bg-watermark bg-watermark-br" alt="" />
    </div>
  );
}
