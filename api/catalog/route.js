import { put, list } from '@vercel/blob';
import { NextResponse } from 'next/server';

// Чтение каталога
export async function GET() {
  try {
    const { blobs } = await list();
    const catalogBlob = blobs.find(b => b.pathname === 'catalog.json');
    
    if (!catalogBlob) {
      return NextResponse.json([]); // Если файла еще нет, возвращаем пустой массив
    }

    const response = await fetch(catalogBlob.url);
    const data = await response.json();
    
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Запись / обновление каталога
export async function POST(request) {
  try {
    const updatedCatalog = await request.json();

    // Перезаписываем файл catalog.json в облаке Vercel Blob
    const blob = await put('catalog.json', JSON.stringify(updatedCatalog, null, 2), {
      access: 'public',
      addRandomSuffix: false, // Отключаем случайный суффикс, чтобы файл всегда назывался ровно catalog.json
    });

    return NextResponse.json({ success: true, url: blob.url });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
