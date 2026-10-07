import { Routes, Route } from 'react-router-dom';
import LoadsHome from './loads/LoadsHome.jsx';
import LoadDetail from './loads/LoadDetail.jsx';

export default function Loads() {
  return (
    <Routes>
      <Route index element={<LoadsHome />} />
      <Route path=":id" element={<LoadDetail />} />
    </Routes>
  );
}
