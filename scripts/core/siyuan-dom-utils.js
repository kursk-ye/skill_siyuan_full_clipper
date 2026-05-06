// Siyuan DOM Utils
// 复用自 siyuan-chrome 扩展，移除掉依赖 chrome.* 的部分，供 Puppeteer 注入使用

function isIgnoredElement(element) {
    while (element) {
        let tagName = element.tagName.toLowerCase();
        const className = element.className.toLowerCase();
        if (tagName === 'math' ||
            className.includes('math') || className.includes('mathjax') || className.includes('latex') ||
            className.includes('katex') || className.includes('mjx') || className.includes('mathml') ||
            className.includes('equation') || className.includes('formula')) {
            return true;
        }
        element = element.parentElement;
        if (!element) break;
        tagName = element.tagName.toLowerCase();
        if (tagName === 'pre' || tagName === 'code' || tagName === 'span' || tagName === 'section') {
            return true;
        } else if (tagName === 'div' || tagName === 'p') {
            return false;
        }
    }
    return false;
}

function siyuanProcessTextByWhiteSpace(element) {
    const text = element.textContent;
    const whiteSpace = window.getComputedStyle(element).whiteSpace;
    const brTag = '<br>';
    switch (whiteSpace) {
        case 'normal':
        case 'nowrap':
            return text.replace(/[ \t\r\f\v]+/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n+/g, brTag).trim();
        case 'pre':
            return text.replace(/\n/g, brTag);
        case 'pre-wrap':
            return text.replace(/\n+/g, brTag);
        case 'pre-line':
            return text.replace(/[ \t\r\f\v]+/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n+/g, brTag).trim();
        case 'break-spaces':
            return text.replace(/\n/g, brTag);
        default:
            return text.replace(/[ \t\r\f\v]+/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n+/g, brTag).trim();
    }
}

function siyuanSpansAddBr(tempElement) {
    const spans = tempElement.querySelectorAll('span');
    if (!spans || spans.length === 0) return;
    spans.forEach((span) => {
        const style = window.getComputedStyle(span);
        if ((style.whiteSpace.trim().toLowerCase() === 'normal' || style.whiteSpace.trim().toLowerCase() === 'pre-wrap') &&
            (style.wordWrap.trim().toLowerCase() === 'break-word' || style.overflowWrap.trim().toLowerCase() === 'break-word' || style.wordBreak.trim().toLowerCase() === 'break-word')) {
            if (isIgnoredElement(span)) return;
            span.innerHTML = siyuanProcessTextByWhiteSpace(span);
        }
    });
}

function siyuanProcessBoldStyle(tempElement) {
    const boldElements = tempElement.querySelectorAll('*');
    boldElements.forEach(element => {
        const style = window.getComputedStyle(element);
        if (element.tagName === 'B' || element.tagName === 'STRONG' || parentContainsBold(element)) return;

        if (style.fontWeight === 'bold' || style.fontWeight === '700' || parseInt(style.fontWeight) >= 600) {
            const children = element.childNodes;
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                if (child.nodeType === Node.TEXT_NODE) {
                    const text = child.nodeValue;
                    const textElement = document.createElement('b');
                    textElement.textContent = text;
                    element.replaceChild(textElement, child);
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    const childTagName = child.tagName.toLowerCase();
                    if (childTagName === 'b' || childTagName === 'strong' || parentContainsBold(child)) continue;
                    siyuanProcessBoldStyle(child);
                }
            }
        }
    });

    function parentContainsBold(element) {
        let parent = element.parentElement;
        while (parent) {
            if (['B', 'STRONG', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(parent.tagName)) return true;
            parent = parent.parentElement;
        }
        return false;
    }
}

function siyuanProcessItalicStyle(tempElement) {
    const allElements = tempElement.querySelectorAll('*');
    allElements.forEach(element => {
        const style = window.getComputedStyle(element);
        if (element.tagName === 'I' || element.tagName === 'EM' || parentContainsItalic(element)) return;

        if (style.fontStyle === 'italic') {
            const children = element.childNodes;
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                if (child.nodeType === Node.TEXT_NODE) {
                    const text = child.nodeValue;
                    const textElement = document.createElement('i');
                    textElement.textContent = text;
                    element.replaceChild(textElement, child);
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    const childTagName = child.tagName.toLowerCase();
                    if (childTagName === 'i' || childTagName === 'em' || parentContainsItalic(child)) continue;
                    siyuanProcessItalicStyle(child);
                }
            }
        }
    });

    function parentContainsItalic(element) {
        let parent = element.parentElement;
        while (parent) {
            if (['I', 'EM'].includes(parent.tagName)) return true;
            parent = parent.parentElement;
        }
        return false;
    }
}

function siyuanProcessUnderlineStyle(tempElement) {
    const allElements = tempElement.querySelectorAll('*');
    allElements.forEach(element => {
        const style = window.getComputedStyle(element);
        if (element.tagName === 'U' || parentContainsUnderline(element)) return;

        if (style.textDecorationLine && style.textDecorationLine.includes('underline')) {
            const children = element.childNodes;
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                if (child.nodeType === Node.TEXT_NODE) {
                    const text = child.nodeValue;
                    const textElement = document.createElement('u');
                    textElement.textContent = text;
                    element.replaceChild(textElement, child);
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    if (child.tagName.toLowerCase() === 'u' || parentContainsUnderline(child)) continue;
                    siyuanProcessUnderlineStyle(child);
                }
            }
        }
    });

    function parentContainsUnderline(element) {
        let parent = element.parentElement;
        while (parent) {
            if (parent.tagName === 'U') return true;
            parent = parent.parentElement;
        }
        return false;
    }
}

function simplifyNestedTags(root, tagName) {
    let elements = root.querySelectorAll(tagName);
    let hasNested = true;

    while (hasNested) {
        hasNested = false;
        elements.forEach(element => {
            if (simplifyElement(element, tagName)) hasNested = true;
        });
        elements = root.querySelectorAll(tagName);
    }

    function simplifyElement(element, tagName) {
        let nestedFound = false;
        if (element.hasChildNodes()) {
            Array.from(element.childNodes).forEach(child => {
                if (child.nodeType === Node.ELEMENT_NODE) {
                    if (child.tagName === tagName) {
                        nestedFound = true;
                        while (child.firstChild) element.insertBefore(child.firstChild, child);
                        child.remove();
                    } else {
                        nestedFound = nestedFound || simplifyElement(child, tagName);
                    }
                }
            });
        }
        return nestedFound;
    }
}

function siyuanRemoveImgLink(tempElement) {
    const images = tempElement.querySelectorAll('img');
    images.forEach(image => {
        const parent = image.parentElement;
        if (!parent || parent.tagName !== 'A') return;
        const grandParent = parent.parentElement;
        if (!grandParent) return;
        grandParent.insertBefore(image, parent);
        parent.remove();
    });
}

function fixInvalidNesting(doc) {
    const inlineTags = ['span', 'strong', 'b', 'i', 'em', 'a'];
    const blockTags = ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'blockquote', 'section', 'article'];
    const inlineSelector = inlineTags.join(',');
    const blockSelector = blockTags.join(',');

    const allInlines = Array.from(doc.querySelectorAll(inlineSelector));
    const targets = allInlines.filter(el => el.querySelector(blockSelector)).reverse();

    targets.forEach(oldEl => {
        if (!oldEl.parentNode) return;
        const newDiv = doc.createElement('div');
        for (const attr of oldEl.attributes) {
            newDiv.setAttribute(attr.name, attr.value);
        }
        while (oldEl.firstChild) {
            newDiv.appendChild(oldEl.firstChild);
        }
        oldEl.parentNode.replaceChild(newDiv, oldEl);
    });
}

async function siyuanSvgToBase64(svgNode) {
    const serializer = new XMLSerializer();
    let svgStr = serializer.serializeToString(svgNode);
    if (!svgStr.startsWith('<?xml')) svgStr = '<?xml version="1.0" encoding="UTF-8"?>' + svgStr;
    const svgBlob = new Blob([svgStr], {type: 'image/svg+xml'});
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(svgBlob);
    });
}

async function siyuanSvgToImg(tempElement) {
    const svgElements = tempElement.querySelectorAll('svg');
    for (const svg of svgElements) {
        try {
            const img = document.createElement('img');
            img.src = await siyuanSvgToBase64(svg);
            img.style.cssText = window.getComputedStyle(svg).cssText;
            svg.parentNode.replaceChild(img, svg);
        } catch(e) { console.error("SVG convert error", e); }
    }
}

window.runSiyuanPreprocess = async function(config = {}) {
    const tempDoc = document.body; // or document if we want whole doc, but readability usually works on body/html

    if (config.expBold !== false) siyuanProcessBoldStyle(tempDoc);
    if (config.expItalic !== false) siyuanProcessItalicStyle(tempDoc);
    if (config.expUnderline !== false) siyuanProcessUnderlineStyle(tempDoc);
    if (config.expRemoveImgLink !== false) siyuanRemoveImgLink(tempDoc);
    if (config.expSpan !== false) siyuanSpansAddBr(tempDoc);
    if (config.expSvgToImg !== false) await siyuanSvgToImg(tempDoc);

    simplifyNestedTags(tempDoc, 'STRONG');
    simplifyNestedTags(tempDoc, 'B');
    simplifyNestedTags(tempDoc, 'I');
    simplifyNestedTags(tempDoc, 'EM');

    const mathElements = tempDoc.querySelectorAll('.ztext-math');
    mathElements.forEach(mathElement => {
        if (['B', 'STRONG', 'I', 'EM'].includes(mathElement.parentElement?.tagName)) {
            const parent = mathElement.parentElement;
            while (parent.firstChild) parent.parentNode.insertBefore(parent.firstChild, parent);
            parent.remove();
        }
    });

    fixInvalidNesting(tempDoc);

    // Some readability tweaks: ensure comments are not lost
    document.querySelectorAll(".hljs-comment").forEach(item => {
        item.classList.remove("hljs-comment")
        item.classList.add("hljs-cmt")
    });
};
