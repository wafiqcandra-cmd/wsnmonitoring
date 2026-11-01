# Gunakan image PHP resmi yang sudah terintegrasi dengan Apache
FROM php:8.2-apache

# Install ekstensi PostgreSQL untuk PDO
RUN apt-get update && apt-get install -y libpq-dev \
    && docker-php-ext-install pdo pdo_pgsql

# Aktifkan modul mod_rewrite Apache (penting jika Anda menggunakan .htaccess)
RUN a2enmod rewrite

# Ubah direktori kerja ke folder web default Apache
WORKDIR /var/www/html

# Salin seluruh isi folder proyek dari GitHub ke dalam container
COPY . /var/www/html/

# Berikan hak akses (opsional tapi disarankan)
RUN chown -R www-data:www-data /var/www/html
