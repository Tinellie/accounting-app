import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

type PageHeadingProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export default function PageHeading({ eyebrow, title, description }: PageHeadingProps) {
  return (
    <Box id="page-head" sx={{ pb: 3.5, borderBottom: 1, borderColor: 'divider' }}>
      <Typography
        component="p"
        variant="caption"
        sx={{ mb: 1.5, color: 'secondary.main', fontWeight: 700, textTransform: 'uppercase' }}
      >
        {eyebrow}
      </Typography>
      <Typography component="h1" variant="h1">
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25, lineHeight: 1.6 }}>
        {description}
      </Typography>
    </Box>
  );
}