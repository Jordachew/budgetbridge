"""One-off: rewrites supabase/schema.sql so every object is prefixed (rb_) and nothing else in a shared Supabase project is touched."""
import re, sys
TABLES = ['profiles','crews','crew_secrets','crew_members','loads','expenses','income','trips','deliveries','reminders','route_plans','messages','road_alerts']
FUNCS = ['create_crew','join_crew','leave_crew','delete_crew','remove_member','set_share_data','crew_join_code','regenerate_join_code','crew_roster','crew_report','delete_message','clear_alert','delete_my_account']
def transform(s):
    s = re.sub(r'\bprivate\.', 'rb_private.', s)
    s = re.sub(r'(schema (?:if not exists )?)private\b', r'\1rb_private', s)
    for t in sorted(TABLES, key=len, reverse=True):
        s = re.sub(rf'\bpublic\.{t}\b', f'public.rb_{t}', s)
    for f in FUNCS:
        s = re.sub(rf'\bpublic\.{f}\b', f'public.rb_{f}', s)
        s = s.replace(f"'{f}(", f"'rb_{f}(")
    s = re.sub(r"(create (?:unique )?index if not exists )(\w+)", r"\1rb_\2", s)
    # table-name arrays used in DO loops
    def arr(m):
        return re.sub(r"'(\w+)'", lambda x: f"'rb_{x.group(1)}'" if x.group(1) in TABLES else x.group(0), m.group(0))
    s = re.sub(r"foreach t in array array\[[^\]]*\]", arr, s)
    return s
if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    open(dst, 'w').write(transform(open(src).read()))
