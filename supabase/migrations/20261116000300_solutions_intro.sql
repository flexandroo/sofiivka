-- /solutions lists six solutions now (каналізація and розумний будинок joined), so the intro that names them does too.
-- Only the intro as it was written is replaced; one edited in /admin/pages stays. A re-run changes nothing.
update public.site_pages
set lead = 'Комплекти обладнання під конкретну задачу: котельня, вода зі свердловини, очищення води, каналізація, розумний будинок, клімат.',
    updated_at = now()
where slug = 'solutions'
  and lead = 'Комплекти обладнання під конкретну задачу: котельня, вода зі свердловини, очищення води, клімат.';
