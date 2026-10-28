-- OPTIONAL: fake sample profiles so the registry is not empty during your demo.
-- Run after update-1.sql. These names are made up. Delete them from the admin page after the defense.
insert into youth_profiles (full_name, birthdate, sex, purok, contact, status, school_or_work, sk_member, approval) values
('Dela Cruz, Juan A.',   current_date - interval '17 years 2 months',  'Male',   'Purok 1', '09170000001', 'Student',             'Maramag National High School', false, 'Approved'),
('Santos, Maria L.',     current_date - interval '19 years 5 months', 'Female', 'Purok 2', '09170000002', 'Student',             'Torres Capitol College',       true,  'Approved'),
('Reyes, Mark Anthony',  current_date - interval '22 years 1 month',  'Male',   'Purok 3', '09170000003', 'Employed',            'Local store',                  false, 'Approved'),
('Garcia, Angel P.',     current_date - interval '24 years 8 months', 'Female', 'Purok 1', '09170000004', 'Out of School Youth', null,                           false, 'Approved'),
('Mendoza, Paolo R.',    current_date - interval '27 years 3 months', 'Male',   'Purok 4', '09170000005', 'Employed',            'Farm cooperative',             true,  'Approved'),
('Flores, Jessa M.',     current_date - interval '16 years 9 months', 'Female', 'Purok 2', '09170000006', 'Student',             'Maramag National High School', false, 'Pending'),
('Ramos, Kyle D.',       current_date - interval '20 years 4 months', 'Male',   'Purok 3', '09170000007', 'Student',             'Torres Capitol College',       false, 'Pending')
on conflict do nothing;
