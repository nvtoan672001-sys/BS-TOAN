"""Ghép mã nguồn thành một file HTML duy nhất.

    python build.py            -> ghi ra ../Ho-so-benh-nhan.html (thư mục cha, nơi bác sĩ mở app)
    python build.py out.html   -> ghi ra đường dẫn khác (vd. để kiểm thử)

Không cần cài thêm gì; chỉ cần Python 3.
"""
import pathlib, sys

HERE = pathlib.Path(__file__).resolve().parent
JS_ORDER = ['data.js', 'engine.js', 'ui.js']   # thứ tự quan trọng: ui.js dùng hằng số/hàm của 2 file trước

def build(out):
    html = (HERE / 'index.html').read_text(encoding='utf-8')
    css = (HERE / 'style.css').read_text(encoding='utf-8')
    js = '\n'.join((HERE / f).read_text(encoding='utf-8') for f in JS_ORDER)
    assert html.count('/*CSS*/') == 1 and html.count('/*JS*/') == 1, 'index.html phải có đúng một /*CSS*/ và một /*JS*/'
    out = pathlib.Path(out)
    out.write_text(html.replace('/*CSS*/', css).replace('/*JS*/', js), encoding='utf-8')
    print(f'Đã ghi {out} ({out.stat().st_size:,} byte)')

if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else HERE.parent / 'Ho-so-benh-nhan.html')
