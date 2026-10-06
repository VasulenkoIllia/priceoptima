import { describe, expect, it } from 'vitest';
import { imageUrlOf } from '../../../images/images.mapper';
import { imageList } from '../types';

const ID = '1_Gz6FsrJyDX8ePqB7DgajOYQOyabc-XY';

describe('фото з прайсу: посилання Google Диска (правки замовника 07.10)', () => {
  it('при завантаженні прайсу посилання на сторінку перегляду стає прямим посиланням; повтор не дублюється', () => {
    expect(
      imageList([
        `https://drive.google.com/file/d/${ID}/view?usp=drive_link`,
        `https://drive.google.com/open?id=${ID}`,
        'https://img.example/a.jpg',
      ]),
    ).toEqual([`https://lh3.googleusercontent.com/d/${ID}=w1600`, 'https://img.example/a.jpg']);
  });

  it('уже збережене фото з прайсу показується за прямим посиланням; завантажене — нашим методом', () => {
    expect(imageUrlOf({ id: 'i1', source: 'feed', url: `https://drive.google.com/file/d/${ID}/view` })).toBe(`https://lh3.googleusercontent.com/d/${ID}=w1600`);
    expect(imageUrlOf({ id: 'i2', source: 'upload', url: null })).toBe('/api/images/i2');
  });
});
