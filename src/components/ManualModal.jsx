import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { fieldGuide } from '../utils/fieldGuide.js';
// Import URLs only. Opening a chapter loads its screenshots on demand.
const screenshots = import.meta.glob('../../docs/figuras/*.png', { eager: true, query: '?url', import: 'default' });

function GuideImage({ id, caption, lang }) {
  const lightbox = useRef(null);
  const source = screenshots['../../docs/figuras/' + lang + '-' + id + '.png'];
  const pt = lang === 'pt';
  return <figure className="guide-shot">
    <button onClick={() => lightbox.current.showModal()} aria-label={(pt ? 'Ampliar imagem. ' : 'Enlarge image. ') + caption}>
      <img src={source} alt={caption} loading="lazy"/><span className="zoom-photo" aria-hidden="true">{pt ? 'Ampliar' : 'Enlarge'} ↗</span>
    </button>
    <figcaption>{caption}</figcaption>
    <dialog className="guide-lightbox" ref={lightbox} aria-label={caption} onCancel={event => event.stopPropagation()}>
      { /* The thumbnail and expanded view share the same cached local asset. */ }
      <img src={source} alt={caption} loading="lazy"/>
      <footer><span>{caption}</span><button className="br-btn" onClick={() => lightbox.current.close()}>{pt ? 'Fechar imagem' : 'Close image'}</button></footer>
    </dialog>
  </figure>;
}

export function ManualModal({ onClose }) {
  const { lang } = useTranslation();
  const chapters = fieldGuide[lang];
  const [index, setIndex] = useState(0);
  const dialog = useRef(null), article = useRef(null);
  const [, title, intro, sections] = chapters[index];
  const firstIllustration = sections.find(step => step[2]);
  const pt = lang === 'pt';
  useEffect(() => {
    const el = dialog.current;
    el.showModal();
    return () => el.close();
  }, []);
  function openChapter(next) {
    setIndex(next);
    article.current?.scrollTo(0, 0);
    article.current?.focus();
  }
  return <dialog className="field-guide" ref={dialog} aria-labelledby="guide-title"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="guide-header"><div><span>BeckaRepo</span><h2 id="guide-title">{pt ? 'Guia de uso' : 'User guide'}</h2></div>
      <button className="br-btn" onClick={onClose}>{pt ? 'Fechar' : 'Close'} <kbd>Esc</kbd></button></header>
    <div className="guide-body">
      <nav aria-label={pt ? 'Capítulos' : 'Chapters'}>{chapters.map(([name], i) =>
        <button key={name} aria-current={i === index ? 'page' : undefined} onClick={() => openChapter(i)}>{name}</button>)}</nav>
      <article ref={article} tabIndex={-1} aria-labelledby="chapter-title">
        <h2 id="chapter-title">{title}</h2><p className="guide-intro">{intro}</p>
        {firstIllustration && <GuideImage id={firstIllustration[2]} caption={firstIllustration[3]} lang={lang}/>}
        {sections.map(([heading, body, image, caption]) => <section key={heading}>
          <h3>{heading}</h3><p>{body}</p>
          {image && image !== firstIllustration?.[2] && <GuideImage id={image} caption={caption} lang={lang}/>}
        </section>)}
        {index + 1 < chapters.length && <button className="guide-next" onClick={() => openChapter(index + 1)}>{chapters[index + 1][0]} →</button>}
      </article>
    </div>
  </dialog>;
}
