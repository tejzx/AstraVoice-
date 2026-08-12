CREATE TABLE public.company_faq (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.company_faq TO anon, authenticated;
GRANT ALL ON public.company_faq TO service_role;
ALTER TABLE public.company_faq ENABLE ROW LEVEL SECURITY;
CREATE POLICY "FAQ is public" ON public.company_faq FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  department text NOT NULL,
  role text NOT NULL,
  availability text NOT NULL DEFAULT 'Available',
  phone text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.contacts TO anon, authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Contact directory is public" ON public.contacts FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_name text NOT NULL,
  phone text,
  email text,
  department text NOT NULL,
  appointment_date date NOT NULL,
  appointment_time time NOT NULL,
  purpose text,
  status text NOT NULL DEFAULT 'Scheduled',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.call_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id text NOT NULL,
  caller_name text,
  phone text,
  email text,
  intent text,
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  outcome text,
  appointment_required boolean NOT NULL DEFAULT false,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  escalated boolean NOT NULL DEFAULT false,
  escalation_reason text,
  duration integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.call_records TO service_role;
ALTER TABLE public.call_records ENABLE ROW LEVEL SECURITY;

INSERT INTO public.company_faq (category, question, answer) VALUES
('General','What does the company do?','Rooman Technologies provides technology and skill development solutions.'),
('Location','Where is the Bengaluru office?','#15B, Electronic City Phase 1, Veerasandra, Near HCL Technologies, Bengaluru - 560100.'),
('Timing','What are the office timings?','Monday to Friday, 9:30 AM to 6:30 PM.'),
('Services','What services do you provide?','Technology training, skill development and related technology services.'),
('Careers','Are there career opportunities?','Current opportunities depend on available openings.');

INSERT INTO public.contacts (name, department, role, availability, phone, email) VALUES
('Anjali Sharma','HR','HR Manager','Available','+91 80 1234 5601','anjali.sharma@example.com'),
('Rahul Mehta','Admissions','Admissions Executive','Available','+91 80 1234 5602','rahul.mehta@example.com'),
('Kavya Rao','Support','Support Executive','Busy','+91 80 1234 5603','kavya.rao@example.com');